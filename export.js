"use strict";

var Q = require("q");
var prompt = require("prompt");
var fs = require("fs");

var conf;
var d2 = require("./js/d2.js");
var doc = require("./js/documentation.js");
var utils = require("./js/utils.js");

var metaData;
var exportQueue = [];
var lastUrl = "";
var currentExport;
var customObjectsExported = {};
var exporting = false;

var dhis2version; 

process.on("uncaughtException", function (err) {
	console.log("Caught exception: " + err);
});

run();


/**
 * Prompt user and password, then make a queue of exports to process
 */
function run() {
	//Read configuration file. Will exit if not found or if not in correct format
	readConfig();

	var dhis2Instances = {};

	//Iterate over complete export file, and sort exports per server (to avoid asking for user/pwd multiple times)
	for (var i = 0; i < conf.export.length; i++) {
		for (var j = 0; j < conf.export[i]._url.length; j++) {
			if (!dhis2Instances[conf.export[i]._url[j]]) {
				dhis2Instances[conf.export[i]._url[j]] = [conf.export[i]];
			}
			else {
				dhis2Instances[conf.export[i]._url[j]].push(conf.export[i]);
			}
		}
	}
	for (var instance in dhis2Instances) {
		for (var i = 0; i < dhis2Instances[instance].length; i++) {

			//Copy export specification, then specify the URL
			var exp = JSON.parse(JSON.stringify(dhis2Instances[instance][i]));
			exp.url = instance;
			exportQueue.push(exp);
		}
	}

	nextExport();

}

/**
 * Read configuration file as commandline argument
 */
function readConfig() {
	if (process.argv.length <= 2) {
		console.log("Specify path to configuration file(s), for example:");
		console.log("> node export.js hivConfig.json");
		process.exit(1);
	}
	else {
		var thisConf;
		conf = { "export": []};
		for (var i = 2; i < process.argv.length; i++) {
			var fileName = process.argv[i];
			try {
				thisConf = JSON.parse(fs.readFileSync(fileName, "utf8"));
			}
			catch (err) {
				console.log("Problem reading configuration file: " + fileName);
				console.log(err);
				console.log("Please provide a valid path to the configuration file");
				process.exit(1);
			}
			
			if (!thisConf.hasOwnProperty("export")) {
				console.log("Configuration file " + fileName + " does not have a valid structure");
				process.exit(1);
			}
			conf.export = conf.export.concat(thisConf.export);
			console.log("Loaded configuration file " + fileName);
		}
		
	}
	return true;
}


/**
 * Start next export that is queued
 */
function nextExport() {
	if (exporting) return;

	currentExport = exportQueue.pop();
	if (!currentExport) {
		console.log("\nNo more exports queued\n");
		return;
	}
	else {
		exporting = true;
	}

	//If next export is a new URL, ask for username and password. Else start export directly
	if (currentExport.url == lastUrl) startExport();
	else connectNewInstance();

}



function connectNewInstance() {

	console.log("\n##### Connecting to DHIS2 #####");
	console.log("Server: " + currentExport.url);


	//Start prompt
	prompt.start();
	
	var schema = {
		properties: {
			username: {
				required: true
			},
			password: {
				hidden: true,
				required: true
			}
		}
	};
	
	prompt.get(schema, function (err, result) {		
		d2.authentication(currentExport.url, result.username, result.password);
		
		d2.get("/api/system/info.json").then(function(result) {
			console.log("\nConnected to instance: " + result.systemName);
			console.log("DHIS2 version: " + result.version);

			lastUrl = currentExport.url;
			dhis2version = result.version;
			
			startExport();

		});
	});  	
}


function startExport() {
	metaData = {};
	customObjectsExported = {};

	console.log("\n***** Packaging " + currentExport._name + " *****");

	if (currentExport._type === "completeAggregate" || currentExport._type === "custom") {
		exportAggregate();
	}

	else if (currentExport._type === "dashboardAggregate") {
		exportDashboard();
	}

	else if (currentExport._type === "tracker") {
		exportTracker();
	}
}



function cancelCurrentExport() {
	console.log("\n✘ Cancelling export '" + currentExport._name + "' due to errors.\n");
	exporting = false;
	nextExport();
}



/**
 * DASHBOARD (AGGREGATE) EXPORT (2.27)
 **/
 
/**
 * Start export of complete aggregate packages: dataset and dashboards with deps
 */
function exportDashboard() {
	
	console.log("1. Downloading metadata");		
	//Do initial dependency export
	var promises = [
		dependencyExport("dashboard", currentExport.dashboardIds)
	];
	Q.all(promises).then(function (results) {
				
		//Get indicators and categoryOptionGroupSets from favourites
		//Get indicator groups from conf files
		promises = [
			indicators(), 
			categoryOptionGroupSetStructure(),
			saveObject("indicatorGroups", currentExport.indicatorGroupIds),
			saveObject("userGroups", [].concat(currentExport._sharing.accessGroupIds, 
				currentExport._sharing.adminGroupIds)),
			saveObject("users", [currentExport._sharing.userId])
		];
		Q.all(promises).then(function (results) {

			//Get legends from data elements, indicators and favourites
			//Get indicator types from indicators
			promises = [
				indicatorTypes(), 
				legendSets(),
				customObjects()
			];
			Q.all(promises).then(function (results) {
				console.log("✔ Downloaded metadata successfully");
				processDashboard();
			
			});	
			
		});
		
	});
				
}


/**
 * Verify, modify and save aggregate package
 */
function processDashboard() {
	
	var success = true;
	console.log("\n2. Validating exported metadata");
	
	//Remove current configuration of indicators and cateogry option groups
	clearIndicatorFormulas();
	clearCategoryOptionGroups();

	//Reset/remove lat/long/zoom on maps
	clearMapZoom();
	
	//Add prefix to objects to be mapped
	prefixIndicators();
	prefixCategoryOptionGroups();
	
	//Make sure we don't include orgunit assigment in datasets or users, and orgunit levels in predictors
	clearOrgunitAssignment();

	//Remove ownership
	removeOwnership();

	//Remove users from user groups
	clearUserGroups();
	
	//Make sure the "default defaults" are used
	setDefaultUid();

	//Remove invalid references to data elements, indicators, catOptGroups from groups (group sets)
	//Verify that there are no data elements or indicators without groups
	if (!validateGroupReferences()) success = false;	
	
	//Verify that favourites only use relative orgunits
	if (!validateFavoriteOrgunits()) success = false;
	
	//Verify that favourites only use indicators
	if (!validateFavoriteDataItems()) success = false;
	
	//Verify that no unsupported data dimensions are used
	if (!validateFavoriteDataDimension()) success = false;
	
	/** CUSTOM MODIFICATIONS */
	if (currentExport.hasOwnProperty("_customFuncs")) {
		for (var customFunc of currentExport._customFuncs) {
			var func = new Function("metaData", customFunc);
			func(metaData); 
		}
	}

	if (success) {
		console.log("✔ Validation passed");
		saveDashboard();
	}
	else {
		console.log("");
		var schema = {
			properties: {
				continue: {
					description: "Validation failed. Continue anyway? (yes/no)",
					required: true,
					type: "string",
					default: "no",
				}
			}
		};
		
		prompt.get(schema, function (err, result) {	
			if (result.continue == 'yes')  saveDashboard();
			else cancelCurrentExport();
		});  
	}
}


/**
 * Save dashboard package
 */
function saveDashboard() {

	console.log("\n3. Saving metadata and documentation");

	//Sort the content of our package
	metaData = utils.sortMetaData(metaData);
	
	//Make a folder for storing the files in this package
	var basePath = makeFolder();	
	
	//Add "ID" - package identifier + date
	metaData["package"] = packageLabel() + "_" + new Date().toISOString().substr(0, 16);
	
	//Save metadata to json file and documentation to markdown files
	Q.all([
		utils.saveFileJson(basePath + "/metadata", metaData),	
		doc.makeReferenceList(basePath + "/", metaData),
		doc.makeConfigurationChecklist(basePath + "/", metaData),
		doc.makeAvailabilityChecklist(basePath + "/", metaData),		
	]).then(function(results) {
		exporting = false;
		nextExport();
		
	});
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
		
	console.log("1. Downloading metadata");	

	//Do initial dependency export
	var promises = [
		dependencyExport("dataSet", currentExport.dataSetIds), 
		dependencyExport("dashboard", currentExport.dashboardIds),
		limitedDependencyExport(currentExport.exportDataSetIds)
	];
	Q.all(promises).then(function (results) {
				
		
		//Get indicators and categoryOptionGroupSets from favourites and groups
		//Get validation rules and groups from conf file
		//Get data element and indicator groups from conf files
		promises = [
			indicators(), 
			categoryOptionGroupSetStructure(),
			validationRules(),
			saveObject("dataElementGroups", currentExport.dataElementGroupIds),
			saveObject("indicatorGroups", currentExport.indicatorGroupIds),
			saveObject("userGroups", [].concat(currentExport._sharing.accessGroupIds, 
				currentExport._sharing.adminGroupIds)),
			saveObject("users", [currentExport._sharing.userId])
		];
		Q.all(promises).then(function (results) {

			//Get legends from data elements, indicators and favourites
			//Get indicator types from indicators
			//Get predictors based on data elements
			promises = [
				indicatorTypes(), 
				legendSets(), 
				predictors(),
				customObjects()
			];
			Q.all(promises).then(function (results) {
				
				processAggregate();
			
			});	
			
		});
		
	});
				
}


/**
 * Verify, modify and save aggregate package
 */
function processAggregate() {

	var success = true;
	console.log("\n2. Validating exported metadata");
	
	//Remove ownership
	removeOwnership();

	//Remove users from user groups
	clearUserGroups();

	//Reset/remove lat/long/zoom on maps
	clearMapZoom();
		
	//Make sure the "default defaults" are used
	setDefaultUid();
	
	//Make sure we don't include orgunit assigment in datasets or users, or orgunit levels in predictors
	clearOrgunitAssignment();
	
	//Verify that all data elements referred in indicators, validation rules,
	//predictors are included
	if (!validateDataElementReference()) success = false;

	//Remove invalid references to data elements or indicators from groups
	//Verify that there are no data elements or indicators without groups
	if (!validateGroupReferences()) success = false;	
	
	//Verify that favourites only use relative orgunits
	if (!validateFavoriteOrgunits()) success = false;
	
	//Verify that favourites only use indicators
	if (!validateFavoriteDataItems()) success = false;
	
	//Verify that no unsupported data dimensions are used
	if (!validateFavoriteDataDimension()) success = false;

	//Verify that data sets with section include all data elements
	if (!validationDataSetSections()) success = false;
	
	/** CUSTOM MODIFICATIONS */
	if (currentExport.hasOwnProperty("_customFuncs")) {
		for (var customFunc of currentExport._customFuncs) {
			var func = new Function("metaData", customFunc);
			func(metaData); 
		}
	}
	
	if (success) {
		console.log("✔ Validation passed");
		saveAggregate();
	}
	else {
		console.log("");
		var schema = {
			properties: {
				continue: {
					description: "Validation failed. Continue anyway? (yes/no)",
					required: true,
					type: "string",
					default: "no",
				}
			}
		};
		
		prompt.get(schema, function (err, result) {	
			if (result.continue == 'yes') saveAggregate();
			else cancelCurrentExport();
		});  
	}
}


/**
 * Save aggregate package
 */
function saveAggregate() {

	console.log("\n3. Saving metadata and documentation");

	//Sort the content of our package
	metaData = utils.sortMetaData(metaData);
	
	//Make a folder for storing the files in this package
	var basePath = makeFolder();	
	
	//Add "ID" - package identifier + date
	metaData["package"] = packageLabel() + "_" + new Date().toISOString().substr(0, 16);
	
	
	//Save metadata to json file and documentation to markdown files
	Q.all([
		utils.saveFileJson(basePath + "/metadata", metaData),	
		doc.makeReferenceList(basePath + "/", metaData),
		doc.makeAvailabilityChecklist(basePath + "/", metaData)
	]).then(function(results) {
		exporting = false;
		nextExport();
		
	});
}




/**
 * TRACKER EXPORT
 **/
 
/**
 * Start export of complete aggregate packages: dataset and dashboards with deps
 */
function exportTracker() {
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
		

	console.log("1. Downloading metadata");	

	//Do initial dependency export
	var promises = [
		dependencyExport("program", currentExport.programIds), 
		dependencyExport("dashboard", currentExport.dashboardIds)
	];
	Q.all(promises).then(function (results) {
				
		
		//Get indicators and categoryOptionGroupSets from favourites and groups
		//Get validation rules and groups from conf file
		//Get data element and indicator groups from conf files
		promises = [
			indicators(), 
			categoryOptionGroupSetStructure(),
			saveObject("dataElementGroups", currentExport.dataElementGroupIds),
			saveObject("indicatorGroups", currentExport.indicatorGroupIds),
			saveObject("userGroups", [].concat(currentExport._sharing.accessGroupIds, 
				currentExport._sharing.adminGroupIds)),
			saveObject("users", [currentExport._sharing.userId])
		];
		Q.all(promises).then(function (results) {

			//Get legends from data elements, indicators and favourites
			//Get indicator types from indicators
			//Get predictors based on data elements
			promises = [
				indicatorTypes(), 
				legendSets(), 
				predictors(),
				customObjects()
			];
			Q.all(promises).then(function (results) {
				
				processTracker();
			
			});	
			
		});
		
	});
				
}


/**
 * Verify, modify and save tracker package
 */
function processTracker() {

	var success = true;
	console.log("\n2. Validating exported metadata");
	
	//Remove ownership
	removeOwnership();

	//Remove users from user groups
	clearUserGroups();
		
	//Make sure the "default defaults" are used
	setDefaultUid();
	
	//Make sure we don't include orgunit assigment in datasets or users
	clearOrgunitAssignment();
	
	//Verify that all data elements referred in indicators, validation rules,
	//predictors are included
	if (!validateDataElementReference()) success = false;

	//Verify that all program indicators referred to in indicators and predictors are included
	if (!validateProgramIndicatorReference()) success = false;

	//Remove invalid references to data elements or indicators from groups
	//Verify that there are no data elements or indicators without groups
	if (!validateGroupReferences()) success = false;	
	
	//Verify that favourites only use relative orgunits
	if (!validateFavoriteOrgunits()) success = false;
	
	//Verify that favourites only use indicators
	if (!validateFavoriteDataItems()) success = false;
	
	//Verify that no unsupported data dimensions are used
	if (!validateFavoriteDataDimension()) success = false;

	//Verify that data sets with section include all data elements
	if (!validationDataSetSections()) success = false;


	/** CUSTOM MODIFICATIONS */
	if (currentExport.hasOwnProperty("_customFuncs")) {
		for (var customFunc of currentExport._customFuncs) {
			var func = new Function("metaData", customFunc);
			func(metaData); 
		}
	}
	
	if (success) {
		console.log("✔ Validation passed");
		saveTracker();
	}
	else {
		console.log("");
		var schema = {
			properties: {
				continue: {
					description: "Validation failed. Continue anyway? (yes/no)",
					required: true,
					type: "string",
					default: "no",
				}
			}
		};
		
		prompt.get(schema, function (err, result) {	
			if (result.continue == 'yes')  saveTracker();
			else cancelCurrentExport();
		});  
	}
}


/**
 * Save tracker package
 */
function saveTracker() {

	console.log("\n3. Saving metadata and documentation");

	//Sort the content of our package
	metaData = utils.sortMetaData(metaData);
	
	//Make a folder for storing the files in this package
	var basePath = makeFolder();	
	
	//Add "ID" - package identifier + date
	metaData["package"] = packageLabel() + "_" + new Date().toISOString().substr(0, 16);
	
	
	//Save metadata to json file and documentation to markdown files
	Q.all([
		utils.saveFileJson(basePath + "/metadata", metaData),	
		doc.makeReferenceList(basePath + "/", metaData)
	]).then(function(results) {
		exporting = false;
		nextExport();
		
	});
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

	//Add any customObjects ids for this type, if any
	ids = ids.concat(customObjectIds(type));
	
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
		case "program": 
			promises.push(d2.get("/api/programs/" + id + 
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
	if (dataSetIds.length == 0) return true;	
	
	
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
	var deferred = Q.defer();

	//Indicators from favorites
	var types = ["charts", "mapViews", "reportTables"], ids = [];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; metaData.hasOwnProperty(types[k]) && i < metaData[types[k]].length; i++) {
			for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
				if (metaData[types[k]][i].dataDimensionItems[j].dataDimensionItemType === "INDICATOR") {
					ids.push(metaData[types[k]][i].dataDimensionItems[j].indicator.id);
				}
			}
		}
	}
	
	var promises = [];
	promises.push(saveObject("indicators", ids));
	promises.push(d2.get("/api/indicators.json?filter=indicatorGroups.id:in:[" + 		
		currentExport.exportIndicatorGroupsIds.join(",") + "]&fields=:owner&paging=false"));
	
	Q.all(promises).then(function (results) {
		addToMetdata("indicators", results[1].indicators);
		deferred.resolve(true);
	});
	
	return deferred.promise;
}



function indicatorTypes() {	
	var ids = [], ind = metaData.indicators;
	for (var i = 0; ind && i < ind.length; i++) {
		ids.push(ind[i].indicatorType.id);
	}

	return saveObject("indicatorTypes", ids);
}



function categoryOptionGroupSetStructure() {
	var deferred = Q.defer();

	var ids = [];
	for (var type of ["charts", "mapViews", "reportTables", "eventReports", "eventCharts"]) {
		for (var i = 0; metaData.hasOwnProperty(type) && i < metaData[type].length; i++) {
			var item = metaData[type][i];
			if (item.hasOwnProperty("categoryOptionGroupSetDimensions")) {
				for (var cogs of item["categoryOptionGroupSetDimensions"]) {
					ids.push(cogs.categoryOptionGroupSet.id);
				}
			}
		}	
	}

	var promises = [];
	ids = ids.concat(customObjectIds("categoryOptionGroupSets"));
	promises.push(object("categoryOptionGroupSets", ids));
	promises.push(d2.get("/api/categoryOptionGroups.json?fields=:owner&filter=groupSets.id:in:[" + 
		ids.join(",") + "]&paging=false"));
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
	ids = ids.concat(customObjectIds("validationRuleGroups"));
	promises.push(object("validationRuleGroups", ids));
	promises.push(d2.get("/api/validationRules.json?fields=:owner&filter=validationRuleGroups.id:in:[" + 
		ids.join(",") + "]&paging=false"));
	
	var validationRuleIds = customObjectIds("validationRules");
	if (validationRuleIds.length > 0) promises.push(object("validationRules", validationRuleIds));
	
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
	for (var i = 0; metaData.dataElements && i < metaData["dataElements"].length; i++) {
		dataElementIds.push(metaData["dataElements"][i].id);
	}

	//All predictors that target a data element in the export
	var promises = [];
	promises.push(d2.get("/api/predictors.json?fields=:owner&paging=false&filter=output.id:in:[" 
			+ dataElementIds.join(",") + "]"));

	//All predictors in the customObjects export
	promises.push(saveObject("predictors", []));

	Q.all(promises).then(function(results) {
		addToMetdata("predictors", results[0]["predictors"]);
		deferred.resolve(true);		
	});	
	return deferred.promise;
}



function legendSets() {
	
	//LegendSets from applicable object types
	var types = ["charts", "mapViews", "reportTables", "eventReports", "eventCharts", "dataSets", 
			"dataElements", "indicators"], ids = [];
	for (var k = 0; k < types.length; k++) {
		for (var i = 0; metaData.hasOwnProperty(types[k]) && i < metaData[types[k]].length; i++) {
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


function customObjects() {
	var deferred = Q.defer();
	
	var promises = [];
	if (currentExport.hasOwnProperty("customObjects")) {
		for (var obj of currentExport.customObjects) {
			if (!customObjectsExported[obj.objectType]) {
				promises.push(saveObject(obj.objectType, obj.objectIds));
			}
		}
	}

	Q.all(promises).then(function(results) {
		deferred.resolve(true);
	});

	return deferred.promise;
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

/**
 * Clear assignment of orgnuits of dataSets, programs and users.
 */
function clearOrgunitAssignment() {
	for (var i = 0; metaData.dataSets && i < metaData.dataSets.length; i++) {
		metaData.dataSets[i].organisationUnits = [];
	}

	for (var i = 0; metaData.programs && i < metaData.programs.length; i++) {
		metaData.programs[i].organisationUnits = [];
	}

	for (var i = 0; metaData.users && i < metaData.users.length; i++) {
		metaData.users[i].organisationUnits = [];
		metaData.users[i].dataViewOrganisationUnits = [];
		metaData.users[i].teiSearchOrganisationUnits = [];
	}


	for (var i = 0; metaData.hasOwnProperty("predictors") && i < metaData.predictors.length; i++) {
		metaData.predictors[i].organisationUnitLevels = [];
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


//Clear/reset map lat/long/zoom
function clearMapZoom() {
	for (var i = 0; metaData.maps && i < metaData.maps.length; i++) {
		if (parseInt(dhis2version.split(".")[1]) < 29) {
			metaData.maps[i].latitude = 0;
			metaData.maps[i].longitude = 0;
			metaData.maps[i].zoom = 2;
		}
		else {
			delete metaData.maps[i].latitude;
			delete metaData.maps[i].longitude;
			delete metaData.maps[i].zoom;
		}
	}
}


//Clear user groups, leaving only the included "owner" user.
function clearUserGroups() {
	for (var i = 0; metaData.userGroups && i < metaData.userGroups.length; i++) {
		metaData.userGroups[i].users = [
			{ "id": currentExport._sharing.userId }
		];
	}
}


//Remove "user", "userAccesses" for applicable objects, set userGroupAccesses and publicaccess according to configuration.json
function removeOwnership() {
	for (var objectType in metaData) {
		var obj = metaData[objectType];
		for (var j = 0; j < obj.length; j++) {
		
			if (obj[j].hasOwnProperty("user")) {
				obj[j].user = { "id": currentExport._sharing.userId };
			}

			if (obj[j].hasOwnProperty("userAccesses")) {
				delete obj[j].userAccesses;
			}

			//IF < 29 then no data access sharing
			var dataAccessSharing;
			parseInt(dhis2version.split(".")[1]) < 29 ? dataAccessSharing = false : dataAccessSharing = false;
				
			if (obj[j].hasOwnProperty("userGroupAccesses")) {
				//TODO - option for preseverving existing groups?
				var userGroupAccessSharing = [];
				for (var k = 0; k < currentExport._sharing.adminGroupIds.length; k++) {
					userGroupAccessSharing.push({
						"access": dataAccessSharing ? "rwr-----" : "rw------", 
						"id": currentExport._sharing.adminGroupIds[k], 
						"userGroupUid": currentExport._sharing.adminGroupIds[k]
					});
				}
				for (var k = 0; k < currentExport._sharing.accessGroupIds.length; k++) {
					userGroupAccessSharing.push({
						"access": dataAccessSharing ? "r-r-----" : "r-------", 
						"id": currentExport._sharing.accessGroupIds[k], 
						"userGroupUid": currentExport._sharing.accessGroupIds[k]
					});
				}
				obj[j].userGroupAccesses = userGroupAccessSharing;
			}
			
			if (obj[j].hasOwnProperty("publicAccess")) {
				obj[j].publicAccess = currentExport._sharing.publicAccess;
			}
		}
	}
}


//Add prefix to indicators
function prefixIndicators() {
	if (!metaData.indicators) return;
	for (var indicator of metaData.indicators) {
		indicator.name = currentExport._prefix + " " + indicator.name;
	}
}


//Add prefix to categoryOptionGroups
function prefixCategoryOptionGroups() {
	if (!metaData.categoryOptionGroups) return;
	for (var group of metaData.categoryOptionGroups) {
		group.name = currentExport._prefix + " " + group.name;
	}
}



/** VALIDATION FUNCTIONS **/

//Check for hardcoded orgunits in favorites (mapViews, reportTables, charts), print warning
function validateFavoriteOrgunits() {

	var issues = [];
	for (var type of ["charts", "mapViews", "reportTables", "eventReports", "eventCharts"]) {
		for (var i = 0; metaData.hasOwnProperty(type) && i < metaData[type].length; i++) {
			var item = metaData[type][i];
			var nameableItem = (type == "mapViews") ? mapFromMapView(item.id) : item;
			if (item.organisationUnits.length > 0) {
				issues.push({
					"id": nameableItem.id,
					"name": nameableItem.name,
					"type": type,
					"error": "fixed orgunits"
				});
			}
			if (item.organisationUnitLevels.length > 0) {
				issues.push({
					"id": nameableItem.id,
					"name": nameableItem.name,
					"type": type,
					"error": "orgunit levels"
				});
			}
			if (item.itemOrganisationUnitGroups.length > 0) {
				issues.push({
					"id": nameableItem.id,
					"name": nameableItem.name,
					"type": type,
					"error": "orgunit groups"
				});
			}
		}
	}
	
	if (issues.length > 0) {
		console.log("\nERROR | Invalid orgunit parameters in favourites:");
		
		var printed = {};
		for (var issue of issues) {
			if (!printed[issue.id + issue.error]) {
				console.log(issue.type + ": " + issue.id + " - '" + issue.name + 
					"': " + issue.error);
				printed[issue.id + issue.error] = true;
			}
		}
		return false;
	}
	else return true;
}


//Verify that only indicators are used in favourites
function validateFavoriteDataItems() {
	//Data elements from favorites
	var issues = [];
	for (var type of ["charts", "mapViews", "reportTables"]) {
		for (var i = 0; metaData.hasOwnProperty(type) && i < metaData[type].length; i++) {
			var item = metaData[type][i];
			for (var dimItem of item.dataDimensionItems) {

				if (dimItem.dataDimensionItemType != "INDICATOR") {


					//Exception: custom objects we list, but don't stop the export
					var abort = customObject(type, item.id) ? false : true;						
					
					var nameableItem = (type == "mapViews") ? mapFromMapView(item.id) : item;
						
					issues.push({
						"id": nameableItem.id,
						"name": nameableItem.name,
						"type": type,
						"error": dimItem.dataDimensionItemType,
						"abort": abort
					});
				}
			}
		}
	}
	
	if (issues.length > 0) {	
		console.log("\nERROR | Favourites not using indicators only:");
		
		abort = false;

		var printed = {};
		for (var issue of issues) {
			abort = abort || issue.abort;
			if (!printed[issue.id + issue.error]) {
				console.log(issue.type + ": " + issue.id + " - '" + issue.name + 
					"': " + issue.error);
				printed[issue.id + issue.error] = true;
			}
			
		}
		return !abort;
	}
	else return true;
}


//Check that not unsupported (data element group sets, orgunit group sets, 
//category) dimensions are used in favourites
function validateFavoriteDataDimension() {
	
	var issues = [];
	for (var type of ["charts", "mapViews", "reportTables", "eventReports", "eventCharts"]) {
		for (var i = 0; metaData.hasOwnProperty(type) && i < metaData[type].length; i++) {
			var item = metaData[type][i];
			var nameableItem;
			if (item.hasOwnProperty("dataElementGroupSetDimensions") 
					&& item.dataElementGroupSetDimensions.length > 0) {
				nameableItem = (type == "mapViews") ? 
					mapFromMapView(item.id) : item;
				
				issues.push({
					"id": nameableItem.id,
					"name": nameableItem.name,
					"type": type,
					"error": "dataElementGroupSet"
				});
			}
			if (item.hasOwnProperty("organisationUnitGroupSetDimensions") 
					&& item.organisationUnitGroupSetDimensions.length > 0) {
				nameableItem = (type == "mapViews") ? 
					mapFromMapView(item.id) : item;
				
				issues.push({
					"id": nameableItem.id,
					"name": nameableItem.name,
					"type": type,
					"error": "organisationUnitGroupSet"
				});
			}
			if (item.hasOwnProperty("categoryDimensions") 
					&& item.categoryDimensions.length > 0) {
				nameableItem = (type == "mapViews") ? 
					mapFromMapView(item.id) : item;
				
				issues.push({
					"id": nameableItem.id,
					"name": nameableItem.name,
					"type": type,
					"error": "category"
				});
			}
		}
	}

	if (issues.length > 0) {	
		console.log("\nERROR | Favourites using unsupported data dimension:");
		
		var printed = {};
		for (var issue of issues) {
			if (!printed[issue.id + issue.error]) {
				console.log(issue.type + ": " + issue.id + " - '" + issue.name + 
					"': " + issue.error);
				printed[issue.id + issue.error] = true;
			}
		}
		return false;
	}
	else return true;
}


//Check if predictor or indicator formulas references data elements or data sets that are not
//part of the export
function validateDataElementReference() {
	var ids = {};


	//Data elements/data sets from indicator formulas
	var result;
	for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
		result = utils.idsFromIndicatorFormula(metaData.indicators[i].numerator, 
			metaData.indicators[i].denominator, true);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "indicator " + metaData.indicators[i].id;
		}
	}
	
	//Data elements/data sets from predictor formulas
	for (var i = 0; metaData.predictors && i < metaData.predictors.length; i++) {
		result = utils.idsFromFormula(
			metaData.predictors[i].generator.expression, 
			true
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "predictor " + metaData.predictors[i].id;
		}
	}
	
	//Data elements/data sets from validation rule formulas
	for (var i = 0; metaData.validationRules && i < metaData.validationRules.length; i++) {
		result = utils.idsFromFormula(
			metaData.validationRules[i].leftSide.expression, 
			true
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "validationRule " + metaData.validationRules[i].id;
		}
		
		result = utils.idsFromFormula(
			metaData.validationRules[i].rightSide.expression, 
			true
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "validationRule " + metaData.validationRules[i].id;
		}
	}
	
	var missing = [];
	for (var id in ids) {
		if (!objectExists("dataElements", id) && !objectExists("dataSets", id)) {
			missing.push({"id": id, "type": ids[id]});
		}
	}
	
	if (missing.length > 0) {
		console.log("\nERROR | Data elements/data sets referenced, but not included in export:");
		for (var issue of missing) {
			console.log(issue.id + " referenced in " + issue.type);
		}
		return false;
	}
	else return true;
}


//Check if predictor or indicator formulas references program indicators that are not
//part of the export
function validateProgramIndicatorReference() {
	var ids = {};


	//Program indicators from indicator formulas
	var result;
	for (var i = 0; i < metaData.indicators.length; i++) {
		result = utils.programIndicatorIdsFromIndicatorFormula(metaData.indicators[i].numerator, 
			metaData.indicators[i].denominator);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "indicator " + metaData.indicators[i].id;
		}
	}
	
	//Program indicators from predictor formulas
	for (var i = 0; metaData.predictors && i < metaData.predictors.length; i++) {
		result = utils.programIndicatorIdsFromFormula(
			metaData.predictors[i].generator.expression
		);
			
		for (var j = 0; j < result.length; j++) {
			ids[result[j]] = "predictor " + metaData.predictors[i].id;
		}
	}
	
	var missing = [];
	for (var id in ids) {
		if (!objectExists("programIndicators", id)) {
			missing.push({"id": id, "type": ids[id]});
		}
	}
	
	if (missing.length > 0) {
		console.log("\nERROR | Program indicators referenced, but not included in export:");
		for (var issue of missing) {
			console.log(issue.id + " referenced in " + issue.type);
		}
		return false;
	}
	else return true;
}


//Remove data element and indicator membership where members are not in export,
//and add new groups with data elements and indicators not currently grouped
function validateGroupReferences() {


	//data element group membership
	var item, group, grouped = {}, unGrouped = [], found = false, validMembers;
	for (var i = 0; metaData.dataElementGroups && i < metaData.dataElementGroups.length; i++) {
		validMembers = [];
		group = metaData.dataElementGroups[i];
		for (var j = 0; j < group.dataElements.length; j++) {
			item = group.dataElements[j];
			found = false;
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
	for (var i = 0; metaData.dataElements && i < metaData.dataElements.length; i++) {
		if (!grouped.hasOwnProperty(metaData.dataElements[i].id)) {
			unGrouped.push({
				"id": metaData.dataElements[i].id,
				"name": metaData.dataElements[i].shortName,
				"type": "dataElements"
			});
		}
	}


	//indicator group membership
	grouped = {};
	for (var i = 0; metaData.indicatorGroups && i < metaData.indicatorGroups.length; i++) {
		validMembers = [];
		group = metaData.indicatorGroups[i];

		for (var j = 0; j < group.indicators.length; j++) {
			item = group.indicators[j];
			found = false;
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

	for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
		if (!grouped.hasOwnProperty(metaData.indicators[i].id)) {
			unGrouped.push({
				"id": metaData.indicators[i].id,
				"name": metaData.indicators[i].shortName,
				"type": "indicators"
			});
		}
	}


	//catetory option group membership
	for (var i = 0; metaData.hasOwnProperty("categoryOptionGroups") && i < metaData.categoryOptionGroups.length; i++) {
		var group = metaData.categoryOptionGroups[i];
		var validOptions = [];
		for (var j = 0; group.hasOwnProperty("categoryOptions") && j < group.categoryOptions.length; j++) {
			var option = group.categoryOptions[j];

			//Check if the option referenced is part if the category options
			if (objectExists("categoryOptions", option.id)) {
				validOptions.push(option);
			}
		}
		metaData.categoryOptionGroups[i].categoryOptions = validOptions;
	}

	
	if (unGrouped.length > 0) {
		console.log("\nERROR | Data elements/indicators referenced, but not in any groups:");
		for (var issue of unGrouped) {
			console.log(issue.type + " - " + issue.id + " - " 
				+ issue.name);
		}
	}
	else return true;
}


function validationDataSetSections() {
	if (!metaData.dataSets || !metaData.sections) return true;
	
	var issues = [];
	for (var ds of metaData.dataSets) {

		var dataElements = {};
		for (var dse of ds.dataSetElements) {
			dataElements[dse.dataElement.id] = true;
		}

		var hasSections = false;
		for (var sec of metaData.sections) {
			if (sec.dataSet.id == ds.id) {
				hasSections = true;
				for (var de of sec.dataElements) {
					delete dataElements[de.id];
				}
			}
		}
				
		if (hasSections) {
			for (var id in dataElements) {
				issues.push({
					"dataSet": ds.id,
					"dataElement": id
				});
			}
		}
	}
	
	if (issues.length > 0) {
		console.log("\nERROR | Data elements in data set, but not sections:");
		for (var issue of issues) {
			console.log(issue.dataElement + " in data set " + issue.dataSet);
		}
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


//Get map from mapview
function mapFromMapView(mapViewId) {
	for (var map of metaData.maps) {
	
		for (var mv of map.mapViews) {
			if (mv.id === mapViewId) return map;
		}
	}
	return null;
}


//Get Ids for a given object type, is specified in customObjects
function customObjectIds(objType) {
	customObjectsExported[objType] = true;
	if (!currentExport.hasOwnProperty("customObjects")) return [];
	
	for (var obj of currentExport.customObjects) {
		if (obj.objectType == objType) {
			return obj.objectIds;
		}
	}
	return [];
}

//Checks if an item with the given type and id is custom, in which case we ignore validation issues 
function customObject(objType, objId) {
	customObjectsExported[objType] = true;
	if (!currentExport.hasOwnProperty("customObjects")) return false;
	
	for (var obj of currentExport.customObjects) {
		if (obj.objectType == objType) {
			for (var id of obj.objectIds) {
				if (id == objId) return true;
			}
		}
	}
	return false;
}


//Get package "label"
function packageLabel() {
	var type = "";
	switch (currentExport._type) {
	case "completeAggregate": 
		type = "COMPLETE";
		break;
	case "custom": 
		type = "CUSTOM";
		break;
	case "dashboardAggregate":
		type = "DASHBOARD";
		break;
	case "tracker":
		type = "TRACKER";
		break;
	}

	var identifier = currentExport._code;
	identifier += "_" + type;
	identifier += "_V" + currentExport._version;
	identifier += "_DHIS" + dhis2version;
	
	return identifier;
	
}


//Make folder
function makeFolder() {

	var path = currentExport._basePath + "/" + currentExport._code;


	var type = "";
	switch (currentExport._type) {
	case "completeAggregate": 
		type = "COMPLETE";
		break;
	case "custom": 
		type = "CUSTOM";
		break;
	case "dashboardAggregate":
		type = "DASHBOARD";
		break;
	case "tracker":
		type = "TRACKER";
		break;
	}
	path += "_" + type;
	path += "_V" + currentExport._version.substr(0,1); //Only major version
	path += "_DHIS" + dhis2version;
	
	try {
		fs.mkdirSync(path);
	} 
	catch (err) {
		if (err.code !== "EEXIST") {
			throw err;
		}
	}
	
	return path;
}
