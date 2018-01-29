"use strict";

var Q = require("q");

var conf = require("./conf/configuration.json");
var d2 = require("./js/d2.js");
var doc = require("./js/documentation.js");
var utils = require("./js/utils.js");

var metaData;
var exportQueue = [];
var currentExport;
var uids;
var operandDictionary = {};
var favoriteModifications = {};

var exporting = false;

var debug = true;
process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});

run();

/**
 * Make a queue of exports to process
 */
function run() {
	for (var i = 0; i < conf.export.length; i++) {
		exportQueue.push(conf.export[i]);
	}

	nextExport();
}


/**
 * Start next export that is queued
 */
function nextExport() {
	if (exporting) return;

	currentExport = exportQueue.pop();
	if (!currentExport) {
		console.log("All exports done!");
		return;
	}
	else {
		exporting = true;
		console.log("Exporting " + currentExport.name + ". " + exportQueue.length + 
			" remaining after this");
	}

	metaData = {};
	operandDictionary = {};
	favoriteModifications = {};

	if (currentExport.type === "completeAggregate") {
		exportAggregate();
	}

	else if (currentExport.type === "dashboardAggregate") {
		//exportDashboardAggregate();
	}
}



function cancelCurrentExport() {
	console.log("\nCancelling export '" + currentExport.name + "' due to errors.\n");
	exporting = false;
	nextExport();
}



/**
 * COMPLETE AGGREGATE EXPORT (2.27)
 **/
 
/**
 * Start export of complete aggregate packages: dataset and dashboards with deps
 */
function exportAggregate() {
	/*
	Only data element in datasets included. Include config option for "placeholder"
	datasets that is only used to get dependencies, but where the actual dataset is not 
	included in the export file. This also includes other data elements used in 
	indicators, like those for population.
	
	Favourites and indicator formulas should still be checked for data elements, 
	category option groups, legend sets etc. For legend sets, category option groups etc
	they should be included, but for data elements we should only show a warning that 
	they need to be added to a data set to be included.
	*/
		
	//Do initial dependency export
	var promises = [
		dependencyExport('dataSet', currentExport.dataSetIds), 
		dependencyExport('dashboard', currentExport.dashboardIds),
		limitedDependencyExport(currentExport.exportDataSetIds)
	];
	Q.all(promises).then(function (results) {
				
		//Get indicators and categoryOptionGroupSets from favourites
		//Get validation rules and groups from conf file
		//Get data element and indicator groups from conf files
		promises = [
			indicators(), 
			categoryOptionGroupSetStructure(),
			validationRules(),
			saveObject("dataElementGroups", currentExport.dataElementGroupIds),
			saveObject("indicatorGroups", currentExport.indicatorGroupIds)
		];
		Q.all(promises).then(function (results) {

			//Get legends from data elements, indicators and favourites
			//Get indicator types from indicators
			//Get predictors based on data elements
			promises = [
				indicatorTypes(), 
				legendSets(), 
				predictors()
			];
			Q.all(promises).then(function (results) {
				if (debug) {
					console.log("Content after export:");
					metaDataObjects();
				}
				
				processAggregate();
			
			});	
			
		});
		
		//Verify that all data elements are included, based on favourites and
		//indicator formulas
	});
				
}



/**
 * Verify, modify and save aggregate package
 */
function processAggregate() {

	//Verify that all data elements referred in indicators, validation rules,
	//predictors are included
	if (!validateDataElementReference()) cancelCurrentExport();
	
	//Verify that there are no un-referenced data elements or indicators in groups
	
	
	//Verify that there are no data elements or indicators without groups
	
	
	console.log("Validation of " + currentExport.name + " passed, ready for modifications");
	
	
	//Make sure the "default defaults"" are used
	setDefaultUid();

	//Verify and modify data element and indicator group references
	//updateGroupReferences();
	
	
	console.log("Ready to save " + currentExport.name);
	
	
	
}


/** 
 * METHODS FOR FETCHING METADATA 
 */
 
//Generic "object by ID" function that returns metadata
function object(type, ids) {
	ids = utils.arrayRemoveDuplicates(ids);
	return d2.get("/api/" + type + ".json?filter=id:in:[" + ids.join(",") + "]&fields=:owner&paging=false");
}


//Generic "object by ID" function that saves metadata
function saveObject(type, ids) {
	var deferred = Q.defer();
	
	object(type, ids).then(function(result) {
		addToMetdata(type, result[type]);
		deferred.resolve(true);			
	});

	return deferred.promise;
}

 
 //Get multiple objects with dependencies
function dependencyExport(type, ids) {
	var deferred = Q.defer();

	var promises = [];
	for (var id of ids) {
		
		switch (type) {
			case "dataSet": 
				promises.push(d2.get("/api/dataSets/" + id + 
					"/metadata.json?attachment=metadataDependency.json"));
				break;
			case "dashboard": 
				promises.push(d2.get("/api/dashboards/" + id + 
					"/metadata.json?attachment=metadataDependency.json"));
				break;
			default:
				console.log("Unknown object for dependency export: " + type);
				deferred.reject(false);
		}
	}
	
	Q.all(promises).then(function(results) {
		for (var result of results) {

			for (var object in result) {
				if (utils.isArray(result[object])) {
					addToMetdata(object, result[object]);
				}
			}
		}	
		
		deferred.resolve(true);
	});	
	
	return deferred.promise;
}



function limitedDependencyExport(dataSetIds) {
	var deferred = Q.defer();
	
	var promises = [];
	for (var id of dataSetIds) {
		promises.push(d2.get("/api/dataSets/" + id + 
			"/metadata.json?attachment=metadataDependency.json"));
	}
	
	Q.all(promises).then(function(results) {
		for (var result of results) {
			
			delete result.dataSets;
			delete result.sections;
			delete result.dataEntryForms;
			
			for (var object in result) {
				if (utils.isArray(result[object])) {
					addToMetdata(object, result[object]);
				}
			}
		}	
		
		deferred.resolve(true);
	});	
	
	
	return deferred.promise;
}



function indicators() {	

	//Indicators from favorites
	var types = ["charts", "mapViews", "reportTables"], ids = [];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; i < metaData[types[k]].length; i++) {
			for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
				if (metaData[types[k]][i].dataDimensionItems[j].dataDimensionItemType === "INDICATOR") {
					ids.push(metaData[types[k]][i].dataDimensionItems[j].indicator.id);
				}
			}
		}
	}
	
	return saveObject("indicators", ids)
}



function indicatorTypes() {	
	var ids = [], ind = metaData.indicators;
	for (var i = 0; i < ind.length; i++) {
		ids.push(ind[i].indicatorType.id);
	}

	return saveObject("indicatorTypes", ids);
}



function categoryOptionGroupSetStructure() {
	var deferred = Q.defer();

	
	var item, ids = [];
	for (var i = 0; i < metaData["charts"].length; i++) {
		item = metaData["charts"][i];


		if (item.series.length > 2) ids.push(item.series);
		if (item.category.length > 2) ids.push(item.category);

		for (var j = 0; j < item.filterDimensions.length; j++) {
			if (item.filterDimensions[j].length > 2) ids.push(item.filterDimensions[j]);
		}
	}
	for (var i = 0; i < metaData["reportTables"].length; i++) {
		item = metaData["reportTables"][i];


		for (var j = 0; j < item.columnDimensions.length; j++) {
			if (item.columnDimensions[j].length > 2) ids.push(item.columnDimensions[j]);
		}
		for (var j = 0; j < item.rowDimensions.length; j++) {
			if (item.rowDimensions[j].length > 2) ids.push(item.rowDimensions[j]);
		}
		for (var j = 0; j < item.filterDimensions.length; j++) {
			if (item.filterDimensions[j].length > 2) ids.push(item.filterDimensions[j]);
		}
	}

	var promises = [];
	promises.push(object("categoryOptionGroupSets", ids));
	promises.push(d2.get("/api/categoryOptionGroups.json?fields=:owner&filter=groupSets.id:in:[" + 
		ids.join(',') + "]&paging=false"));
	Q.all(promises).then(function (results) {
		
		for (var result of results) {
			for (var object in result) {
				if (utils.isArray(result[object])) {
					addToMetdata(object, result[object]);
				}
			}
		}
		deferred.resolve(true);		
	});
	
	return deferred.promise;
}



function validationRules() {
	var deferred = Q.defer();

	var promises = [], ids = currentExport.validationRuleGroupIds;
	promises.push(object("validationRuleGroups", ids));
	promises.push(d2.get("/api/validationRules.json?fields=:owner&filter=validationRuleGroups.id:in:[" + 
		ids.join(',') + "]&paging=false"));
	Q.all(promises).then(function (results) {
		
		for (var result of results) {
			for (var object in result) {
				if (utils.isArray(result[object])) {
					addToMetdata(object, result[object]);
				}
			}
		}
		deferred.resolve(true);		
	});
	
	return deferred.promise;
}



function predictors() {
	var deferred = Q.defer();

	var dataElementIds = [];
	for (var i = 0; i < metaData["dataElements"].length; i++) {
		dataElementIds.push(metaData["dataElements"][i].id);
	}

	d2.get("/api/predictors.json?fields=:owner&paging=false&filter=output.id:in:[" 
			+ dataElementIds.join(",") + "]").then(function(result) {
		addToMetdata("predictors", result["predictors"]);
		deferred.resolve(true);			
	});

	return deferred.promise;
}



function legendSets() {
	
	//LegendSets from applicable object types
	var types = ["charts", "mapViews", "reportTables", "dataSets", 
		"dataElements", "indicators"], ids = [];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; metaData[types[k]] && i < metaData[types[k]].length; i++) {
			var obj = metaData[types[k]][i];
			if (obj.hasOwnProperty("legendSet")) ids.push(obj.legendSet.id);
			if (obj.hasOwnProperty("legendSets")) {
				for (var j = 0; j < obj.legendSets.length; j++) {
					ids.push(obj.legendSets[j].id);
				}
			}
		}
	}
	
	return saveObject("legendSets", ids);
}



/** VERIFICATION AND MODIFICATION FUNCTIONS **/

//Use "hardcoded" UIDs for default combo, category etc
function setDefaultUid() {

	//Set "default" UID to current hardcoded version - for >= 2.26 we could leave it out and point to null, though this wouldn't work with custom forms
	var currentDefault, defaultDefault, types = ["categoryOptions", "categories", "categoryOptionCombos", "categoryCombos"];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; metaData[types[k]] && i < metaData[types[k]].length; i++) {
			if (metaData[types[k]][i].name === "default") currentDefault = metaData[types[k]][i].id;
		}

		if (!currentDefault) continue;

		switch (types[k]) {
		case "categoryOptions":
			defaultDefault = "xYerKDKCefk";
			break;
		case "categories":
			defaultDefault = "GLevLNI9wkl";
			break;
		case "categoryOptionCombos":
			defaultDefault = "HllvX50cXC0";
			break;
		case "categoryCombos":
			defaultDefault = "bjDvmb4bfuf";
			break;
		}

		//search and replace metaData as text, to make sure customs forms are included
		var regex = new RegExp(currentDefault, "g");
		metaData = JSON.parse(JSON.stringify(metaData).replace(regex, defaultDefault));
	}
}


//Clear indicator formulas
function clearIndicatorFormulas() {
	for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
		metaData.indicators[i].numerator = "-1";
		metaData.indicators[i].denominator = "1";
	}
}


//Clear cateogoryOptionGroups
function clearCategoryOptionGroups() {
	for (var i = 0; metaData.categoryOptionGroups && i < metaData.categoryOptionGroups.length; i++) {
		metaData.categoryOptionGroups[i].categoryOptions = [];
	}
}


//Clear predictor formulas
function clearPredictors() {
	for (var i = 0; metaData.predictors && i < metaData.predictors.length; i++) {
		metaData.predictors[i].generator.expression = "-1";
		metaData.predictors[i].organisationUnitLevels = [];
		metaData.predictors[i].output.id = null;
		metaData.predictors[i].outputCombo = null;
	}
}


//Deduplicate categoryOptionGroups
function dedupeCategoryOptionGroups() {

	var deduped = [];
	var seen = {};

	var id;
	for (var i = 0 ; metaData.categoryOptionGroups && i < metaData.categoryOptionGroups.length; i++) {
		id = metaData.categoryOptionGroups[i].id + metaData.categoryOptionGroups[i].categoryOptionGroupSet.id;
		if (!seen[id]) {
			seen[id] = true;
			deduped.push(metaData.categoryOptionGroups[i]);
		}
	}

	metaData.categoryOptionGroups = deduped;
}


//Modify favorites, removing/warning about unsupported data disaggregations
function flattenFavorites() {


	for (var i = 0; metaData.charts && i < metaData.charts.length; i++) {
		var chart = metaData.charts[i];
		var itemID = chart.id;
		var message = "";
		for (var j = 0; j < chart.categoryDimensions.length; j++) {
			var dec = chart.categoryDimensions[j].dataElementCategory.id;
			message += "* Add " + categoryName(dec) + " as ";
			message += (chart.category === dec ? "category" : "series") + " dimension. \n";

			//Need to temporarily add other dimensions (from filter) as category/series to make sure it is valid
			var placeholderDim = chart.filterDimensions.pop();
			if (chart.category === dec) chart.category = placeholderDim;
			else chart.series = placeholderDim;
		}
		if (chart.categoryDimensions.length > 0) {

			if (!favoriteModifications[itemID]) favoriteModifications[itemID] = { "category": true, message: ""};
			favoriteModifications[itemID].category = true;
			favoriteModifications[itemID].message += message;

			chart.categoryDimensions = [];
		}

		if (chart.categoryOptionGroups.length > 0) console.log("INFO: chart " + chart.name + " (" + chart.id + ") uses categoryOptionGroups");
		if (chart.dataElementGroups.length > 0) console.log("ERROR: chart " + chart.name + " (" + chart.id + ") uses dataElementGroups");
	}


	for (var i = 0; metaData.reportTables && i < metaData.reportTables.length; i++) {
		var reportTable = metaData.reportTables[i];
		var itemID = reportTable.id;
		var message = "";
		for (var j = 0; j < reportTable.categoryDimensions.length; j++) {
			var dec = reportTable.categoryDimensions[j].dataElementCategory.id;

			for (var k = 0; k < reportTable.columnDimensions.lenght; k++) {
				if (reportTable.columnDimensions[k] === dec) {
					message += "* Add " + categoryName(dec) + " as column dimension. \n";

					//remove dimension
					reportTable.columnDimensions.splice(k, 1);

					if (reportTable.columnDimensions.length === 0) {
						reportTable.columnDimensions.push(reportTable.filterDimensions.pop());
					}


				}
			}

			for (var k = 0; k < reportTable.rowDimensions.lenght; k++) {
				if (reportTable.rowDimensions[k] === dec) {
					message += "* Add " + categoryName(dec) + " as row dimension. \n";

					//remove dimension
					reportTable.rowDimensions.splice(k, 1);

					if (reportTable.rowDimensions.length === 0) {
						reportTable.rowDimensions.push(reportTable.filterDimensions.pop());
					}
				}
			}
		}
		if (reportTable.categoryDimensions.length > 0) {

			if (!favoriteModifications[itemID]) favoriteModifications[itemID] = { "category": true, message: ""};
			favoriteModifications[itemID].category = true;
			favoriteModifications[itemID].message += message;

			reportTable.categoryDimensions = [];
		}


		if (reportTable.categoryOptionGroups.length > 0) console.log("INFO: reportTable " + reportTable.name + " (" + reportTable.id + ") uses categoryOptionGroups");
		if (reportTable.dataElementGroups.length > 0) console.log("ERROR: reportTable " + reportTable.name + " (" + reportTable.id + ") uses dataElementGroups");
	}
}


//Transform all data elements, data element operands and reporting rates in favorites to indicators, and update favorites accordingly //TODO: only data sets
function favoriteDataDimensionItemsToIndicators() {
	if (!metaData.indicators) metaData.indicators = [];

	//Data elements from favorites
	var types = ["charts", "mapViews", "reportTables"];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; i < metaData[types[k]].length; i++) {
			for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
				var indicator = null, dimItem = metaData[types[k]][i].dataDimensionItems[j];

				var itemID = metaData[types[k]][i].id;


				if (dimItem.dataDimensionItemType === "DATA_ELEMENT") {
					indicator = dataElementToIndicator(dimItem.dataElement.id);
				}
				else if (dimItem.dataDimensionItemType === "DATA_ELEMENT_OPERAND") {
					indicator = dataElementOperandToIndicator(dimItem.dataElementOperand.dataElement.id, dimItem.dataElementOperand.categoryOptionCombo.id);
				}
				else if (dimItem.dataDimensionItemType === "REPORTING_RATE") {
					indicator = dataSetToIndicator(dimItem.reportingRate);
					if (!favoriteModifications[itemID]) favoriteModifications[itemID] = { "dataSet": true, message: ""};
					favoriteModifications[itemID].dataSet = true;
					favoriteModifications[itemID].message += "* Insert dataset completeness " + indicator.name + "\n";
				}
				else if (dimItem.dataDimensionItemType != "INDICATOR") {
					console.log("ERROR: Unsupported data dimension item type in " + types[k] + " with ID " + metaData[types[k]][i].id);
				}

				if (indicator) {

					//Check if it already exists
					var found = false;
					for (var l = 0; !false && l < metaData.indicators.length; l++) {
						if (indicator.id === metaData.indicators[l].id) found = true;
					}
					if (!found)	metaData.indicators.push(indicator);


					metaData[types[k]][i].dataDimensionItems[j] = {
						"dataDimensionItemType": "INDICATOR",
						"indicator": {
							"id": indicator.id
						}
					};
				}
			}
		}
	}
}


//Transform data set to indicator
function dataSetToIndicator(reportingRate) {
	//TODO: Need to fetch dataset to get translation
	var indicator = {
		"id": reportingRate.id,
		"code": reportingRate.code ? reportingRate.code : null,
		"name": reportingRate.name,
		"shortName": reportingRate.shortName,
		"description": "[MODIFICATION: REPLACE WITH DATASET COMPLETENESS IN FAVORITES]",
		"indicatorType": {"id": numberIndicatorType()},
		"numerator": "-1",
		"denominator": "1",
		"numeratorDescription": "COMPLETENESS " + reportingRate.name,
		"denominatorDescription": "1",
		"lastUpdated": null, //TODO
		"annualized": false,
		"publicAccess": currentExport.publicAccess
	};

	return indicator;
}


//Remove "user", "userGroupAccesses" for applicable objects, set publicaccess according to configuration.json
function removeOwnership() {
	for (var objectType in metaData) {
		var obj = metaData[objectType];
		for (var j = 0; j < obj.length; j++) {
			if (obj[j].hasOwnProperty("user")) delete obj[j].user;
			if (obj[j].hasOwnProperty("userGroupAccesses")) delete obj[j].userGroupAccesses;
			if (obj[j].hasOwnProperty("publicAccess")) obj[j].publicAccess = currentExport.publicAccess;

		}
	}
}


//Returns number indicator type, adds new if it does not exist
function numberIndicatorType() {

	for (var i = 0; metaData.indicatorTypes && i < metaData.indicatorTypes.length; i++) {
		if (metaData.indicatorTypes[i].number) return metaData.indicatorTypes[i].id;
	}

	if (!metaData.indicatorTypes) metaData.indicatorTypes = [];
	var template = {
		"factor": 1,
		"id": "kHy61PbChXr",
		"name":	"Numerator only",
		"number": true,
		"translations": [
			{
				"locale": "fr",
				"property":	"NAME",
				"value": "Numérateur seulement"
			}
		]
	};

	metaData.indicatorTypes.push(template);
	return template.id;
}


//Remove data element and indicator membership where members are not in export,
//and add new groups with data elements and indicators not currently grouped
function updateGroupReferences() {


	//data element group membership
	var grouped = {};
	for (var i = 0; metaData.dataElementGroups && i < metaData.dataElementGroups.length; i++) {
		var group = metaData.dataElementGroups[i];
		var validMembers = [];
		
		for (var j = 0; j < group.dataElements.length; j++) {
			var item = group.dataElements[j];

			var found = false;
			for (var k = 0; !found && metaData.dataElements && k < metaData.dataElements.length; k++) {
				if (item.id === metaData.dataElements[k].id) {
					found = true;
				}
			}

			if (found) {
				validMembers.push(item);
				grouped[item.id] = true;
			}
		}
		metaData.dataElementGroups[i].dataElements = validMembers;
		delete metaData.dataElementGroups[i].dataElementGroupSet;
	}
	var unGrouped = [];
	for (var i = 0; metaData.dataElements && i < metaData.dataElements.length; i++) {
		if (!grouped.hasOwnProperty(metaData.dataElements[i].id)) {
			unGrouped.push({"id": metaData.dataElements[i].id});
		}
	}
	if (unGrouped.length > 0 && currentExport.type != "dashboardAggregate") {
		if (!metaData.dataElementGroups) metaData.dataElementGroups = [];
		metaData.dataElementGroups.push({
			"name": "[Other data elements] " + currentExport.name,
			"id": uids.pop(),
			"publicAccess": currentExport.publicAccess,
			"dataElements": unGrouped,
			"lastUpdated": new Date().toISOString()
		});
	}

	//indicator group membership
	grouped = {};
	for (var i = 0; metaData.indicatorGroups && i < metaData.indicatorGroups.length; i++) {
		var group = metaData.indicatorGroups[i];
		var validMembers = [];

		for (var j = 0; j < group.indicators.length; j++) {
			var item = group.indicators[j];



			var found = false;
			for (var k = 0; !found && metaData.indicators && k < metaData.indicators.length; k++) {
				if (item.id === metaData.indicators[k].id) {
					found = true;
				}
			}

			if (found) {
				validMembers.push(item);
				grouped[item.id] = true;
			}
		}
		metaData.indicatorGroups[i].indicators = validMembers;
		delete metaData.indicatorGroups[i].indicatorGroupSet;
	}

	var unGrouped = [];
	for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
		if (!grouped.hasOwnProperty(metaData.indicators[i].id)) {
			unGrouped.push({"id": metaData.indicators[i].id});
		}
	}
	
	if (unGrouped.length > 0) {
		if (!metaData.indicatorGroups) metaData.indicatorGroups = [];
		metaData.indicatorGroups.push({
			"name": currentExport.type != "dashboardAggregate" ? "[Other indicators] " + currentExport.name : currentExport.name,
			"id": uids.pop(),
			"publicAccess": currentExport.publicAccess,
			"indicators": unGrouped,
			"lastUpdated": new Date().toISOString()
		});
	}

	return;
}


//Add instructions to favorites on necessary modifications
function favoriteModificationInstructions() {

	var types = ["charts", "maps", "reportTables"];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; i < metaData[types[k]].length; i++) {
			var list = metaData[types[k]];
			for (var i = 0; list && i < list.length; i++) {
				var item = list[i];
				if (favoriteModifications[item.id]) {
					var description = "[MODIFY]: \n"+ favoriteModifications[item.id].message + " [END]\n\n " + (item.description ? item.description : "");
					metaData[types[k]][i].description = description;
				}
			}
		}
	}
}


//Add prefix to indicators
function prefixIndicators() {
	for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
		metaData.indicators[i].name = currentExport.placeHolder + " " + metaData.indicators[i].name;
	}
}



/** VALIDATION FUNCTIONS **/

//Check for hardcoded orgunits in favorites (mapViews, reportTables, charts), print warning
function verifyFavoriteOrgunits() {

	//Consider replacing by "user orgunit children or similar"
	for (var i = 0; metaData.charts && i < metaData.charts.length; i++) {
		var chart = metaData.charts[i];
		if (chart.organisationUnits.length > 0) console.log("ERROR: chart " + chart.name + " (" + chart.id + ") uses fixed orgunits");
		if (chart.organisationUnitLevels.length > 0) console.log("ERROR: chart " + chart.name + " (" + chart.id + ") uses orgunit levels");
		if (chart.organisationUnitGroups.length > 0) console.log("ERROR: chart " + chart.name + " (" + chart.id + ") uses orgunit groups");
	}
	for (var i = 0; metaData.reportTables && i < metaData.reportTables.length; i++) {
		var reportTable = metaData.reportTables[i];
		if (reportTable.organisationUnits.length > 0) console.log("ERROR: reportTable " + reportTable.name + " (" + reportTable.id + ") uses fixed orgunits");
		if (reportTable.organisationUnitLevels.length > 0) console.log("ERROR: reportTable " + reportTable.name + " (" + reportTable.id + ") uses orgunit levels");
		if (reportTable.organisationUnitGroups.length > 0) console.log("ERROR: reportTable " + reportTable.name + " (" + reportTable.id + ") uses orgunit groups");
	}
	var mapViewIssues = [];
	for (var i = 0; metaData.mapViews && i < metaData.mapViews.length; i++) {
		var mapView = metaData.mapViews[i];
		if (mapView.organisationUnits.length > 0) {
			console.log("mapView " + mapView.id + " uses fixed orgunits");
			mapViewIssues.push(mapView.id);
		}
		if (mapView.organisationUnitLevels.length > 0) {
			console.log("mapView " + mapView.id + " uses orgunit levels");
		}
	}
	if (mapViewIssues.length > 0) {
		d2.get("/api/maps.json?fields=name,id&paging=false&filter=mapViews.id:in:[" + mapViewIssues.join(",") + "]").then(function(data) {
			console.log(data);
		});
	}
}


//Check if favourites or indicator formulas references data elements that are not
//part of the export
function validateDataElementReference() {
	var ids = {};

	//Data elements from favourites
	var types = ["charts", "mapViews", "reportTables"];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; i < metaData[types[k]].length; i++) {
			for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
				var dimItem = metaData[types[k]][i].dataDimensionItems[j];
				if (dimItem.dataDimensionItemType === "DATA_ELEMENT") {
					ids[dimItem.dataElement.id] = types[k];
				}
				else if (dimItem.dataDimensionItemType === "DATA_ELEMENT_OPERAND") {
					ids[dimItem.dataElementOperand.dataElement.id] = types[k];
				}
			}
		}
	}

	//Data elements from indicator formulas
	for (var i = 0; i < metaData.indicators.length; i++) {
		var result = utils.idsFromIndicatorFormula(metaData.indicators[i].numerator, 
			metaData.indicators[i].denominator, true);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "indicator";
		}
	}
	
	//Data elements from predictor formulas
	for (var i = 0; metaData.predictors && i < metaData.predictors.length; i++) {
		var result = utils.idsFromFormula(
			metaData.predictors[i].generator.expression, 
			true
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "predictor";
		}
	}
	
	//Data elements from validation rule formulas
	for (var i = 0; metaData.validationRules && i < metaData.validationRules.length; i++) {
		var result = utils.idsFromFormula(
			metaData.validationRules[i].leftSide.expression, 
			true
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "validationRule";
		}
		
		result = utils.idsFromFormula(
			metaData.validationRules[i].rightSide.expression, 
			true
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "validationRule";
		}
	}
	
	var missing = [];
	for (var id in ids) {
		if (!objectExists("dataElements", id)) {
			missing.push({'id': id, 'type': ids[id]});
		}
	}
	
	if (missing.length > 0) {
		console.log("\n*** ERROR ***");
		console.log("Data elements referenced, but not included in export:")
		for (var issue of missing) {
			console.log(issue.id + " referenced in " + issue.type);
		}
		console.log("");
		return false;
	}
	else return true;
}



/** HELPER FUNCTIONS **/

//Print objects in metadata file, with number of items
function metaDataObjects() {
	for (var object in metaData) {
		console.log(object + " - " + metaData[object].length);
	}
}


//Add object to metadata, skipping duplicates.
function addToMetdata(type, objects) {

	for (var obj of objects) {
		if (!objectExists(type, obj.id)) {
			if (!metaData[type]) metaData[type] = [];
			metaData[type].push(obj);
		}
	}
	
}


//Check if object of given type and with given id exists in the metadata export
function objectExists(type, id) {
	if (!metaData.hasOwnProperty(type)) return false;
	
	for (var obj of metaData[type]) {
		if (obj && obj.hasOwnProperty("id") && obj.id === id) return true;
	}
	
	return false;
}


//Get name of category with the given ID
function categoryName(id) {
	for (var i = 0; metaData.categories && metaData.categories && i < metaData.categories.length; i++) {
		if (metaData.categories[i].id === id) return metaData.categories[i].name;
	}

	return "ERROR";
}
