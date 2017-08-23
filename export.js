(function(){
	'use strict';

	var Q = require('q');
	var jsonfile = require('jsonfile');
	var fs = require('fs');

	var conf = require('./conf/configuration.json');
	var d2 = require('./bin/d2.js');

	var metaData;
	var exportQueue = [];
	var currentExport;
	var uids;
	var operandDictionary = {};
	var favoriteModifications = {};

	var exporting = false;

	run();

	/**
	 * Start the export
	 */
	function run() {
		for (var i = 0; i < conf.export.length; i++) {
			exportQueue.push(conf.export[i]);
		}

		nextExport();
	}

	function nextExport() {
		if (exporting) return;

		currentExport = exportQueue.pop();
		if (!currentExport) {
			console.log("All exports done!");
			return;
		}
		else {
			exporting = true;
			console.log("Exporting " + currentExport.name + ". " + exportQueue.length + " remaining");
		}

		metaData = {};
		operandDictionary = {};
		favoriteModifications = {}

		if (currentExport.type === 'completeAggregate') {
			exportCompleteAggregate();
		}

		if (currentExport.type === 'dashboardAggregate') {
			exportDashboardAggregate();
		}
	}


	/** COMPLETE AGGREGATE EXPORT **/
	function exportCompleteAggregate() {
		var promises = [];

		//Get dataSets and dashboards
		promises.push(object('dataSets', currentExport.dataSetIds));
		promises.push(object('dashboards', currentExport.dashboardIds));
		Q.all(promises).then(function(results) {
			metaData.dataSets = results[0].dataSets;
			metaData.dashboards = results[1].dashboards;

			//Get sections, dataEntryForms, dashboardItems
			promises = [];
			promises.push(sections());
			promises.push(dataEntryForms());
			promises.push(dashboardItems());
			Q.all(promises).then(function(results) {
				metaData.sections = results[0].sections;
				metaData.dataEntryForms = results[1].dataEntryForms;
				metaData.dashboardItems = results[2];

				//Get dashboard content - favorites, resources, reports
				dashboardContent().then(function(result) {
					metaData.charts = result.charts;
					metaData.maps = result.maps;
					metaData.reportTables = result.reportTables;
					metaData.documents = result.documents;
					metaData.reports = result.reports;

					//Get mapViews
					mapViews().then(function(result) {
						metaData.mapViews = result;

						//Get indicators and categoryOptionGroupSets, based on favorites and datasets
						promises = [];
						promises.push(indicators());
						promises.push(categoryOptionGroupSets());

						Q.all(promises).then(function(result) {
							metaData.indicators = result[0].indicators;
							metaData.categoryOptionGroupSets = result[1].categoryOptionGroupSets;

							//Get data elements, based on favorites, datasets and indicators
							dataElements(false).then(function(result) {
								metaData.dataElements = result.dataElements;

								//Get LegendSet, categoryCombo, indicatorTypes
								promises = [];
								promises.push(legendSets());
								promises.push(categoryCombos());
								promises.push(indicatorTypes());
								promises.push(categoryOptionGroups());
								promises.push(predictors());
								Q.all(promises).then(function(results) {
									metaData.legendSets = results[0].legendSets;
									metaData.categoryCombos = results[1].categoryCombos;
									metaData.indicatorTypes = results[2].indicatorTypes;
									metaData.categoryOptionGroups = results[3].categoryOptionGroups;
									metaData.predictors = results[4].predictors;

									//Get legends, categories, categoryOptionCombos
									promises = [];
									promises.push(legends());
									promises.push(categories());
									promises.push(categoryOptionCombos()); //TODO

									Q.all(promises).then(function(results) {
										metaData.legends = results[0].legends;
										metaData.categories = results[1].categories;
										metaData.categoryOptionCombos = results[2].categoryOptionCombos;

										//Get categoryoptions
										categoryOptions().then(function(result) {
											metaData.categoryOptions = result.categoryOptions;

											promises = [];
											promises.push(object('dataElementGroups', currentExport.dataElementGroupIds));
											promises.push(object('indicatorGroups', currentExport.indicatorGroupIds));

											Q.all(promises).then(function(results) {
												metaData.dataElementGroups = results[0].dataElementGroups;
												metaData.indicatorGroups = results[1].indicatorGroups;

												promises = [];
												promises.push(object('validationRuleGroups', currentExport.validationRuleGroupIds));
												promises.push(d2.get('/api/validationRules.json?filter=validationRuleGroups.id:in:[' + currentExport.validationRuleGroupIds.join(',') + ']&fields=:owner&paging=false'));

												Q.all(promises).then(function(results) {

													metaData.validationRuleGroups = results[0].validationRuleGroups;
													metaData.validationRules = results[1].validationRules;

													d2.get('/api/system/id.json?limit=100').then(function(result) {
														uids = result.codes;

														console.log("Done exporting " + currentExport.name);
														exportCompleteAggregatePostProcess();
													});

												});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	}

	function exportCompleteAggregatePostProcess() {

		//Remove ownership references, and set publicaccess as outlines in configuration file
		removeOwnership();

		//Verify that orgunit parameters in favorites are usable (i.e. are relative)
		verifyFavoriteOrgunits();

		//Change the default UID to what is used currently the hardcoded values
		setDefaultUid();

		//Remove orgunit assignment from datasets
		for (var i = 0; i < metaData.dataSets.length; i++) {
			metaData.dataSets[i].organisationUnits = [];
		}

		//Remove invalid group references
		updateGroupReferences();

		//TODO: Check for (currently) unsupported favorites types, e.g. data element group sets etc?

		//TODO: Set default catcombo to null when targeting 2.26 and higher

		//TODO: Fix for duplicated categoryOptionGroups
		dedupeCategoryOptionGroups();

		sortMetaData();


		var promises = [];
		promises.push(makeReferenceList());
		promises.push(saveFileJson());
		Q.all(promises).then(function(results) {
			exporting = false;
			nextExport();
		});

	}


	/** DASHBOARD AGGREGATE EXPORT **/
	function exportDashboardAggregate() {
		var promises = [];

		//Get dataSets and dashboards
		object('dashboards', currentExport.dashboardIds).then(function(result) {
			metaData.dashboards = result.dashboards;

			//Get dashboardItems
			dashboardItems().then(function(result) {
				metaData.dashboardItems = result;

				//Get dashboard content - favorites, resources, reports
				dashboardContent().then(function(result) {
					metaData.charts = result.charts;
					metaData.maps = result.maps;
					metaData.reportTables = result.reportTables;
					metaData.documents = result.documents;
					metaData.reports = result.reports;

					//Get mapViews
					mapViews().then(function(result) {
						metaData.mapViews = result;

						//Get indicators and categoryOptionGroupSets, based on favorites and datasets
						promises = [];
						promises.push(indicators());
						promises.push(categoryOptionGroupSets());

						Q.all(promises).then(function(result) {
							metaData.indicators = result[0].indicators;
							metaData.categoryOptionGroupSets = result[1].categoryOptionGroupSets;

							//Get data elements, based on favorites, datasets and indicators
							dataElements(true).then(function(result) {
								metaData.dataElements = result.dataElements;

								//Get LegendSet, categoryCombo, indicatorTypes
								promises = [];
								promises.push(legendSets());
								promises.push(categoryCombos()); //Do we want/need this?
								promises.push(indicatorTypes());
								promises.push(categoryOptionGroups());
								promises.push(predictors());
								Q.all(promises).then(function(results) {
									metaData.legendSets = results[0].legendSets;
									metaData.categoryCombos = results[1].categoryCombos;
									metaData.indicatorTypes = results[2].indicatorTypes;
									metaData.categoryOptionGroups = results[3].categoryOptionGroups;
									metaData.predictors = results[4].predictors;

									//Get legends, categories, categoryOptionCombos
									promises = [];
									promises.push(legends());
									promises.push(categories());
									promises.push(categoryOptionCombos());

									Q.all(promises).then(function(results) {
										metaData.legends = results[0].legends;
										metaData.categories = results[1].categories;
										metaData.categoryOptionCombos = results[2].categoryOptionCombos;

										//Get categoryoptions
										categoryOptions().then(function(result) {
											metaData.categoryOptions = result.categoryOptions;

											promises = [];
											promises.push(object('indicatorGroups', currentExport.indicatorGroupIds));

											Q.all(promises).then(function(results) {
												metaData.indicatorGroups = results[0].indicatorGroups;

												d2.get('/api/system/id.json?limit=100').then(function (result) {
													uids = result.codes;

													console.log("Done exporting");
													exportDashboardAggregatePostProcess();
											});
										});

									});
								});
							});
						});
					});
				});
			});
		});
		});
	}

	function exportDashboardAggregatePostProcess() {

		//Remove ownership references, and set publicaccess as outlines in configuration file
		removeOwnership();

		//Verify that orgunit parameters in favorites are usable (i.e. are relative)
		verifyFavoriteOrgunits();

		//Change the default UID to what is used currently the hardcoded values
		setDefaultUid();

		//TODO: Check for (currently) unsupported favorites types, e.g. data element group sets etc


		//Convert data sets and data elements to indicators in favorites
		favoriteDataDimensionItemsToIndicators();

		//Modify favorites with unsupported disaggregations
		flattenFavorites();

		//Clear indicator formulas (data elements are not included)
		clearIndicatorFormulas();

		//TODO: workaround for duplicated categoryoptiongroups
		dedupeCategoryOptionGroups();

		//Clear categoryOptionGroups (cateogory options are not included)
		clearCategoryOptionGroups();

		//Clear predictor formulas
		clearPredictors();

		//Prefix indicators
		prefixIndicators();

		//Fix indicator groups - remove invalid references and add default group
		updateGroupReferences();

		//Add modification description to favorites
		favoriteModificationInstructions();

		console.log("Removing input-type metadata");

		//Remove input-type elements
		delete metaData.dataElements;
		delete metaData.dataElementGroups;
		delete metaData.categories;
		delete metaData.categoryOptionCombos;
		delete metaData.categoryOptions;
		delete metaData.categoryCombos;

		sortMetaData();

		var promises = [];
		promises.push(makeReferenceList());
		promises.push(makeIndicatorChecklist());
		promises.push(saveFileJson());
		Q.all(promises).then(function(results) {
			exporting = false;
			nextExport();
		});
	}


	/** FETCHING METADATA **/
	//Generic "object by ID" function
	function object(object, ids) {
		ids = arrayRemoveDuplicates(ids);
		return d2.get('/api/' + object + '.json?filter=id:in:[' + ids.join(',') + ']&fields=:owner&paging=false');
	}

	//Specific objects - fetched based on existing object in metaData variable (i.e. needs to be done in a specific order)
	function dashboardItems() {
		var deferred = Q.defer();

		d2.get('/api/dashboardItems.json?fields=:owner&paging=false').then(function(items) {
			items = items.dashboardItems;
			var db = metaData.dashboards;
			//Get dashboardItem ids
			var ids = [];
			for (var i = 0; i < db.length; i++) {
				for (var j = 0; j < db[i].dashboardItems.length; j++) {
					ids.push(db[i].dashboardItems[j].id);
				}
			}

			var includedItems = [];
			for (var i = 0; i < items.length; i++) {
				for (var j = 0; j < ids.length; j++) {
					if (items[i].id === ids[j]) includedItems.push(items[i]);
				}
			}
			deferred.resolve(includedItems);
		});

		return deferred.promise;
	}

	function dataEntryForms() {
		var ids = [], ds = metaData.dataSets;
		for (var i = 0; i < ds.length; i++) {
			if (ds[i].hasOwnProperty('dataEntryForm')) ids.push(ds[i].dataEntryForm.id);
		}

		return object('dataEntryForms', ids);
	}

	function sections() {
		return d2.get('/api/sections.json?filter=dataSet.id:in:[' + currentExport.dataSetIds.join(',') + ']&fields=:owner&paging=false');
	}

	function dashboardContent() {
		var deferred = Q.defer();

		var chartIds = [];
		var mapIds = [];
		var pivotIds = [];
		var resourcesIds = [];
		var reportIds = [];

		var di = metaData.dashboardItems;
		for (var i = 0; i < di.length; i++) {
			if (di[i].hasOwnProperty('chart')) chartIds.push(di[i].chart.id);
			if (di[i].hasOwnProperty('map')) mapIds.push(di[i].map.id);
			if (di[i].hasOwnProperty('reportTable')) pivotIds.push(di[i].reportTable.id);
			if (di[i].reports.length > 0) {
				for (var j = 0; j < di[i].reports.length; j++) {
					reportIds.push(di[i].reports[j].id);
				}
			}
			if (di[i].resources.length > 0) {
				for (var j = 0; j < di[i].resources.length; j++) {
					resourcesIds.push(di[i].resources[j].id);
				}
			}
		}

		var promises = [];
		promises.push(object('charts', chartIds));
		promises.push(object('maps', mapIds)); //TODO: mapviews?
		promises.push(object('reportTables', pivotIds));
		promises.push(object('documents', resourcesIds));
		promises.push(object('reports', reportIds));
		Q.all(promises).then(function(data) {
			var result = {
				'charts': data[0].charts,
				'maps': data[1].maps,
				'reportTables': data[2].reportTables,
				'documents': data[3].documents,
				'reports': data[4].reports
			}

			deferred.resolve(result);

		});

		return deferred.promise;
	}

	function mapViews() {
		var deferred = Q.defer();

		d2.get('/api/mapViews.json?fields=:owner&paging=false').then(function(items) {
			items = items.mapViews;

			var maps = metaData.maps;
			//Get mapView ids
			var ids = [];
			for (var i = 0; i < maps.length; i++) {
				for (var j = 0; j < maps[i].mapViews.length; j++) {
					ids.push(maps[i].mapViews[j].id);
				}
			}

			var includedItems = [];
			for (var i = 0; i < items.length; i++) {
				for (var j = 0; j < ids.length; j++) {
					if (items[i].id === ids[j]) includedItems.push(items[i]);
				}
			}
			deferred.resolve(includedItems);
		});

		return deferred.promise;
	}

	function indicators() {
		var ids = [];

		//Indicators from datasets
		for (var i = 0; metaData.dataSets && i < metaData.dataSets.length; i++) {
			for (var j = 0; j < metaData.dataSets[i].indicators.length; j++) {
				ids.push(metaData.dataSets[i].indicators[j].id);
			}
		}

		//Indicators from favorites
		var types = ['charts', 'mapViews', 'reportTables'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; i < metaData[types[k]].length; i++) {
				for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
					if (metaData[types[k]][i].dataDimensionItems[j].dataDimensionItemType === 'INDICATOR') {
						ids.push(metaData[types[k]][i].dataDimensionItems[j].indicator.id);
					}
				}
			}
		}

		return object('indicators', ids);
	}

	function categoryOptionGroupSets() {

		var ids = [];

		var item;
		for (var i = 0; i < metaData['charts'].length; i++) {
			item = metaData['charts'][i];


			if (item.series.length > 2) ids.push(item.series);
			if (item.category.length > 2) ids.push(item.category);

			for (var j = 0; j < item.filterDimensions.length; j++) {
				if (item.filterDimensions[j].length > 2) ids.push(item.filterDimensions[j]);
			}
		}
		for (var i = 0; i < metaData['reportTables'].length; i++) {
			item = metaData['reportTables'][i];


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

		return object('categoryOptionGroupSets', ids);

	}

	function categoryOptionGroups() {

		var ids = [];

		var item;
		for (var i = 0; i < metaData['categoryOptionGroupSets'].length; i++) {
			var item = metaData['categoryOptionGroupSets'][i];

			for (var j = 0; j < item.categoryOptionGroups.length; j++) {
				ids.push(item.categoryOptionGroups[j].id);
			}
		}

		return object('categoryOptionGroups', ids);

	}

	function predictors() {
		var deferred = Q.defer();

		var dataElementIds = [];
		for (var i = 0; i < metaData['dataElements'].length; i++) {
			dataElementIds.push(metaData['dataElements'][i].id)
		}

		d2.get('/api/predictors.json?fields=:owner&paging=false&filter=output.id:in:[' + dataElementIds.join(',') + ']').then(function(items) {
			deferred.resolve(items);
		});

		return deferred.promise;
	}

	function dataElements(explicitOnly) {
		var ids = [];

		//Data elements from datasets
		for (var i = 0; metaData.dataSets && i < metaData.dataSets.length; i++) {
			for (var j = 0; j < metaData.dataSets[i].dataSetElements.length; j++) {
				ids.push(metaData.dataSets[i].dataSetElements[j].dataElement.id);
			}
		}

		//Data elements from favorites
		var types = ['charts', 'mapViews', 'reportTables'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; i < metaData[types[k]].length; i++) {
				for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
					var dimItem = metaData[types[k]][i].dataDimensionItems[j];
					if (dimItem.dataDimensionItemType === 'DATA_ELEMENT') {
						ids.push(dimItem.dataElement.id);
					}
					else if (dimItem.dataDimensionItemType === 'DATA_ELEMENT_OPERAND') {
						ids.push(dimItem.dataElementOperand.dataElement.id);
					}
				}
			}
		}

		//Data elements from indicator formulas
		for (var i = 0;!explicitOnly && i < metaData.indicators.length; i++) {
			var result = idsFromIndicatorFormula(metaData.indicators[i].numerator, metaData.indicators[i].denominator, true);
			for (var j = 0; j < result.length; j++) {
				ids.push(result[j]);
			}
		}

		return object('dataElements', ids);
	}

	function legendSets() {
			var ids = [];

			//LegendSets from applicable object types
			var types = ['charts', 'mapViews', 'reportTables', 'dataSets', 'dataElements', 'indicators'];
			for (var k = 0; k < types.length; k++) {
				for (var i = 0; metaData[types[k]] && i < metaData[types[k]].length; i++) {
					var obj = metaData[types[k]][i];
					if (obj.hasOwnProperty('legendSet')) ids.push(obj.legendSet.id);
					if (obj.hasOwnProperty('legendSets')) {
						for (var j = 0; j < obj.legendSets.length; j++) {
							ids.push(obj.legendSets[j].id);
						}
					}
				}
			}

			return object('legendSets', ids);
		}

	function categoryCombos() {
		var ids = [];

		var de = metaData.dataElements;
		for (var i = 0; i < de.length; i++) {
			ids.push(de[i].categoryCombo.id);
		}

		return object('categoryCombos', ids);
	}

	function indicatorTypes() {
		var ids = [];

		var ind = metaData.indicators;
		for (var i = 0; i < ind.length; i++) {
			ids.push(ind[i].indicatorType.id);
		}

		return object('indicatorTypes', ids);
	}

	function categories() {
		var ids = [];

		var cc = metaData.categoryCombos;
		for (var i = 0; i < cc.length; i++) {
			for (var j = 0; j < cc[i].categories.length; j++) {
				ids.push(cc[i].categories[j].id);
			}
		}

		return object('categories', ids);
	}

	function categoryOptionCombos() {
		var ccIds = [];

		var cc = metaData.categoryCombos;
		for (var i = 0; i < cc.length; i++) {
			ccIds.push(cc[i].id);
		}

		return d2.get('/api/categoryOptionCombos.json?filter=categoryCombo.id:in:[' + ccIds.join(',') + ']&fields=:owner&paging=false')
	}

	function legends() {
		var ids = [];

		var ls = metaData.legendSets;
		for (var i = 0; i < ls.length; i++) {
			for (var j = 0; j < ls[i].legends.length; j++) {
				ids.push(ls[i].legends[j].id);
			}
		}
		return object('legends', ids);
	}

	function categoryOptions() {
		var ids = [];

		var ca = metaData.categories;
		for (var i = 0; i < ca.length; i++) {
			for (var j = 0; j < ca[i].categoryOptions.length; j++) {
				ids.push(ca[i].categoryOptions[j].id);
			}
		}
		return object('categoryOptions', ids);
	}


	/** MODIFICATION AND HELPER FUNCTIONS **/
	//Get name of category with the given ID
	function categoryName(id) {
		for (var i = 0; metaData.categories && metaData.categories && i < metaData.categories.length; i++) {
			if (metaData.categories[i].id === id) return metaData.categories[i].name;
		}

		return 'ERROR';
	}

	//Modify favorites, removing/warning about unsupported data disaggregations
	function flattenFavorites() {


		for (var i = 0; metaData.charts && i < metaData.charts.length; i++) {
			var chart = metaData.charts[i];
			var itemID = chart.id;
			var message = '';
			for (var j = 0; j < chart.categoryDimensions.length; j++) {
				var dec = chart.categoryDimensions[j].dataElementCategory.id;
				message += '* Add ' + categoryName(dec) + ' as ';
				message += (chart.category === dec ? 'category' : 'series') + ' dimension. \n';

				//Need to temporarily add other dimensions (from filter) as category/series to make sure it is valid
				var placeholderDim = chart.filterDimensions.pop();
				if (chart.category === dec) chart.category = placeholderDim;
				else chart.series = placeholderDim;
			}
			if (chart.categoryDimensions.length > 0) {

				if (!favoriteModifications[itemID]) favoriteModifications[itemID] = { "category": true, message: ''};
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
			var message = '';
			for (var j = 0; j < reportTable.categoryDimensions.length; j++) {
				var dec = reportTable.categoryDimensions[j].dataElementCategory.id;

				for (var k = 0; k < reportTable.columnDimensions.lenght; k++) {
					if (reportTable.columnDimensions[k] === dec) {
						message += '* Add ' + categoryName(dec) + ' as column dimension. \n';

						//remove dimension
						reportTable.columnDimensions.splice(k, 1);

						if (reportTable.columnDimensions.length === 0) {
							reportTable.columnDimensions.push(reportTable.filterDimensions.pop());
						}


					}
				}

				for (var k = 0; k < reportTable.rowDimensions.lenght; k++) {
					if (reportTable.rowDimensions[k] === dec) {
						message += '* Add ' + categoryName(dec) + ' as row dimension. \n';

						//remove dimension
						reportTable.rowDimensions.splice(k, 1);

						if (reportTable.rowDimensions.length === 0) {
							reportTable.rowDimensions.push(reportTable.filterDimensions.pop());
						}
					}
				}
			}
			if (reportTable.categoryDimensions.length > 0) {

				if (!favoriteModifications[itemID]) favoriteModifications[itemID] = { "category": true, message: ''};
				favoriteModifications[itemID].category = true;
				favoriteModifications[itemID].message += message;

				reportTable.categoryDimensions = [];
			}


			if (reportTable.categoryOptionGroups.length > 0) console.log("INFO: reportTable " + reportTable.name + " (" + reportTable.id + ") uses categoryOptionGroups");
			if (reportTable.dataElementGroups.length > 0) console.log("ERROR: reportTable " + reportTable.name + " (" + reportTable.id + ") uses dataElementGroups");
		}
	}

	//Clear indicator formulas
	function clearIndicatorFormulas() {
		for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
			metaData.indicators[i].numerator = '-1';
			metaData.indicators[i].denominator = '1';
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
			metaData.predictors[i].generator.expression = '-1';
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
				deduped.push(metaData.categoryOptionGroups[i])
			}
		}

		metaData.categoryOptionGroups = deduped;
	}

	//Add prefix to indicators
	function prefixIndicators() {
		for (var i = 0; metaData.indicators && i < metaData.indicators.length; i++) {
			metaData.indicators[i].name = currentExport.placeHolder + ' ' + metaData.indicators[i].name;
		}
	}

	//Transform all data elements, data element operands and reporting rates in favorites to indicators, and update favorites accordingly
	function favoriteDataDimensionItemsToIndicators() {
		if (!metaData.indicators) metaData.indicators = [];

		//Data elements from favorites
		var types = ['charts', 'mapViews', 'reportTables'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; i < metaData[types[k]].length; i++) {
				for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
					var indicator = null, dimItem = metaData[types[k]][i].dataDimensionItems[j];

					var itemID = metaData[types[k]][i].id;


					if (dimItem.dataDimensionItemType === 'DATA_ELEMENT') {
						indicator = dataElementToIndicator(dimItem.dataElement.id);
					}
					else if (dimItem.dataDimensionItemType === 'DATA_ELEMENT_OPERAND') {
						indicator = dataElementOperandToIndicator(dimItem.dataElementOperand.dataElement.id, dimItem.dataElementOperand.categoryOptionCombo.id);
					}
					else if (dimItem.dataDimensionItemType === 'REPORTING_RATE') {
						indicator = dataSetToIndicator(dimItem.reportingRate);
						if (!favoriteModifications[itemID]) favoriteModifications[itemID] = { "dataSet": true, message: ''};
						favoriteModifications[itemID].dataSet = true;
						favoriteModifications[itemID].message += '* Insert dataset completeness ' + indicator.name + '\n';
					}
					else if (dimItem.dataDimensionItemType != 'INDICATOR') {
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

	//Transform data element to indicator
	function dataElementToIndicator(dataElementId) {
		var de;
		for (var i = 0; i < metaData.dataElements.length; i++) {
			if (metaData.dataElements[i].id === dataElementId) {
				de = metaData.dataElements[i];
			}
		}

		var indicator = {
			'id': de.id,
			'code': de.code ? de.code : null,
			'name': de.name,
			'shortName': de.shortName,
			'description': de.description ? de.description : null,
			'indicatorType': {"id": numberIndicatorType()},
			'numerator': '-1',
			'denominator': '1',
			'numeratorDescription': de.name,
			'denominatorDescription': '1',
			'lastUpdated': "",
			'annualized': false,
			'publicAccess': currentExport.publicAccess
		}

		return indicator;
	}

	//Transform data element operand to indicator
	function dataElementOperandToIndicator(dataElementId, categoryOptionComboId) {

		//Check if the same operand has already been converted - if so, return the existing one
		var existingIndicatorId = operandDictionary[dataElementId + categoryOptionComboId];
		if (existingIndicatorId) {
			for (var i = 0; i < metaData.indicators.length; i++) {
				if (metaData.indicators[i].id === existingIndicatorId) return metaData.indicators[i];
			}
		}


		var de, coc;
		for (var i = 0; i < metaData.dataElements.length; i++) {
			if (metaData.dataElements[i].id === dataElementId) {
				de = metaData.dataElements[i];
			}
		}
		for (var i = 0; i < metaData.categoryOptionCombos.length; i++) {
			if (metaData.categoryOptionCombos[i].id === categoryOptionComboId) {
				coc = metaData.categoryOptionCombos[i];
			}
		}

		//TODO: combine names from the two in translation

		var indicator = {
			'id': uids.pop(),
			'code': de.code ? de.code : null,
			'name': de.name + ' ' + coc.name,
			'shortName': de.shortName,
			'description': de.description ? de.description + ' \n' + coc.name : null,
			'indicatorType': {"id": numberIndicatorType()},
			'numerator': '-1',
			'denominator': '1',
			'numeratorDescription': de.name,
			'denominatorDescription': '1',
			'lastUpdated': "",
			'annualized': false,
			'publicAccess': currentExport.publicAccess
		}

		//Save mapping of operand IDs to indicator
		operandDictionary[dataElementId + categoryOptionComboId] = indicator.id;

		return indicator;
	}

	//Transform data set to indicator
	function dataSetToIndicator(reportingRate) {
		//TODO: Need to fetch dataset to get translation
		var indicator = {
			'id': reportingRate.id,
			'code': reportingRate.code ? reportingRate.code : null,
			'name': reportingRate.name,
			'shortName': reportingRate.shortName,
			'description': "[MODIFICATION: REPLACE WITH DATASET COMPLETENESS IN FAVORITES]",
			'indicatorType': {"id": numberIndicatorType()},
			'numerator': '-1',
			'denominator': '1',
			'numeratorDescription': "COMPLETENESS " + reportingRate.name,
			'denominatorDescription': '1',
			'lastUpdated': null, //TODO
			'annualized': false,
			'publicAccess': currentExport.publicAccess
		};

		return indicator;
	}

	//Use "hardcoded" UIDs for default combo, category etc
	function setDefaultUid() {

		//Set "default" UID to current hardcoded version - for >= 2.26 we could leave it out and point to null, though this wouldn't work with custom forms
		var currentDefault, defaultDefault, types = ['categoryOptions', 'categories', 'categoryOptionCombos', 'categoryCombos'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; metaData[types[k]] && i < metaData[types[k]].length; i++) {
				if (metaData[types[k]][i].name === 'default') currentDefault = metaData[types[k]][i].id;
			}

			if (!currentDefault) continue;

			switch (types[k]) {
				case 'categoryOptions':
					defaultDefault = "xYerKDKCefk";
					break;
				case 'categories':
					defaultDefault = "GLevLNI9wkl";
					break;
				case 'categoryOptionCombos':
					defaultDefault = "HllvX50cXC0";
					break;
				case 'categoryCombos':
					defaultDefault = "bjDvmb4bfuf";
					break;
			}

			//search and replace metaData as text, to make sure customs forms are included
			var regex = new RegExp(currentDefault, "g");
			metaData = JSON.parse(JSON.stringify(metaData).replace(regex, defaultDefault));
		}
	}

	//Remove "user", "userGroupAccesses" for applicable objects, set publicaccess according to configuration.json
	function removeOwnership() {
		for (var objectType in metaData) {
			var obj = metaData[objectType];
			for (var j = 0; j < obj.length; j++) {
				if (obj[j].hasOwnProperty('user')) delete obj[j].user;
				if (obj[j].hasOwnProperty('userGroupAccesses')) delete obj[j].userGroupAccesses;
				if (obj[j].hasOwnProperty('publicAccess')) obj[j].publicAccess = currentExport.publicAccess;

			}
		}
	}

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
			d2.get('/api/maps.json?fields=name,id&paging=false&filter=mapViews.id:in:[' + mapViewIssues.join(',') + ']').then(function(data) {
				console.log(data);
			});
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

	//Remove data element and indicator membership where members are not in export
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
		if (unGrouped.length > 0 && currentExport.type != 'dashboardAggregate') {
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
				"name": currentExport.type != 'dashboardAggregate' ? "[Other indicators] " + currentExport.name : currentExport.name,
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

		var types = ['charts', 'maps', 'reportTables'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; i < metaData[types[k]].length; i++) {
				var list = metaData[types[k]];
				for (var i = 0; list && i < list.length; i++) {
					var item = list[i];
					if (favoriteModifications[item.id]) {
						var description = '[MODIFY]: \n'+ favoriteModifications[item.id].message + ' [END]\n\n ' + (item.description ? item.description : '');
						metaData[types[k]][i].description = description;
					}
				}
			}
		}
	}


	/** UTILS **/
	//Read metadata and make a Table of Content in markdown format
	function makeReferenceList() {
		var deferred = Q.defer();

		var content = '# Metadata reference\n';

		//dataset: sections, custom form bool, data elements, uid
		if (metaData.dataSets && metaData.dataSets.length > 0) {
			var ds, sec, de;
			content += '\n## Data sets\n'
			for (var i = 0; i < metaData.dataSets.length; i++) {
				ds = metaData.dataSets[i];

				content += '### ' + ds.name + ' \n';
				content += 'Property | Value \n --- | --- \n';
				content += 'Name: | ' + ds.name + '\n';
				content += 'Custom form: | ' + (ds.dataEntryForm ? ds.dataEntryForm.id : 'No') + '\n';
				content += 'Last updated: | ' + ds.lastUpdated.substr(0,10) + '\n';
				content += 'UID: | ' + ds.id+ '\n';

				var secHeader = false;
				for (var j = 0; metaData.sections && j < metaData.sections.length; j++) {
					sec = metaData.sections[j];
					if (sec.dataSet.id == ds.id) {

						if (!secHeader) {
							secHeader = true;
							content += '#### Sections\n'
							content += 'Section | Last updated | UID\n';
							content += '--- | --- | ---\n';
						}

						content += sec.name + ' | ' + sec.lastUpdated.substr(0,10) + ' | ' + sec.id + '\n';
					}
				}

				content += '#### Data Set - Data Set Section - Data Element\n';
				content += 'Data Set | Data Set Section | Data Element\n';
				content += '--- | --- | ---\n';
				for (var k = 0; k < ds.dataSetElements.length; k++) {
					de = ds.dataSetElements[k].dataElement;

					var section = "[None]";
					for (var l = 0; metaData.sections && l < metaData.sections.length; l++) {
						sec = metaData.sections[l];
						if (ds.id === sec.dataSet.id) {
							for (var m = 0; m < sec.dataElements.length; m++) {
								if (de.id === sec.dataElements[m].id) {
									m = sec.dataElements.length;
									l = metaData.sections.length;
									section = sec.name;
								}
							}
						}
					}

					for (var l = 0; l < metaData.dataElements.length; l++) {
						if (de.id === metaData.dataElements[l].id) {
							de = metaData.dataElements[l];
							break;
						}
					}

					content += ds.name + ' | ' + section + ' | ' + de.name + '\n';
				}
			}
		}

		//data elements: name, shortname, description, categorycombo, uid
		if (metaData.dataElements && metaData.dataElements.length > 0) {
			content += '\n## Data Elements\n'
			content += 'Name | Shortname | Description | Categorycombo | Last updated | UID\n'
			content += '--- | --- | --- | --- | --- | --- \n'

			for (var i = 0; i < metaData.dataElements.length; i++) {
				de = metaData.dataElements[i];

				var comboName;
				for (var j = 0; j < metaData.categoryCombos.length; j++) {

					if (de.categoryCombo.id === metaData.categoryCombos[j].id) {
						comboName = metaData.categoryCombos[j].name;
						j = metaData.categoryCombos.length;
					}
				}

				content += de.name + ' | ' + de.shortName + ' | ' + (de.description ? de.description : '_') + ' | ' + comboName + ' | ' + de.lastUpdated.substr(0,10) + ' | ' + de.id + '\n';
			}
		}

		//data element groups
		if (metaData.dataElementGroups && metaData.dataElementGroups.length > 0) {
			content += '\n## Data Element Groups\n'
			content += 'Name | Shortname | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			for (var j = 0; metaData.dataElementGroups && j < metaData.dataElementGroups.length; j++) {
				item = metaData.dataElementGroups[j];
				content += item.name + ' | ' + item.shortName + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';

			}

			content += '### Data Element Groups - Data Elements\n'
			content += 'Data Element Group | Data Element\n'
			content += '--- | --- \n'
			var item, elements;
			for (var j = 0; metaData.dataElementGroups && j < metaData.dataElementGroups.length; j++) {
				item = metaData.dataElementGroups[j];
				for (var k = 0; k < item.dataElements.length; k++) {
					de = item.dataElements[k];
					for (var l = 0; l < metaData.dataElements.length; l++) {
						if (de.id === metaData.dataElements[l].id) {
							content += item.name + ' | ' + metaData.dataElements[l].name + '\n';
						}
					}
				}


			}
		}

		//categorycombos
		if (metaData.categoryCombos && metaData.categoryCombos.length > 0) {
			content += '\n## Category Combinations\n'
			content += 'Name | Last updated | UID | Categories\n'
			content += '--- | --- | --- | --- \n'

			var cc, dec, elements;
			for (var i = 0; i < metaData.categoryCombos.length; i++) {
				cc = metaData.categoryCombos[i];
				elements = [];

				for (var j = 0; j < cc.categories.length; j++) {
					for (var k = 0; k < metaData.categories.length; k++) {
						if (cc.categories[j].id == metaData.categories[k].id) elements.push(metaData.categories[k].name);
					}
				}

				content += cc.name + ' | ' + cc.lastUpdated.substr(0,10) + ' | ' + cc.id + ' | ' + (elements.length > 0 ? elements.join('; ') : ' ') + '\n';
			}
		}

		//categories
		if (metaData.categories && metaData.categories.length > 0) {
			content += '\n## Data Element Categories\n'
			content += 'Name | Last updated | UID | Category options\n'
			content += '--- | --- | --- | --- \n'

			var dec, co, elements;
			for (var i = 0; i < metaData.categories.length; i++) {
				dec = metaData.categories[i];
				elements = [];

				for (var j = 0; j < dec.categoryOptions.length; j++) {
					for (var k = 0; k < metaData.categoryOptions.length; k++) {
						if (dec.categoryOptions[j].id == metaData.categoryOptions[k].id) elements.push(metaData.categoryOptions[k].name);
					}
				}

				content += dec.name + ' | ' + dec.lastUpdated.substr(0,10) + ' | ' + dec.id + ' | ' + (elements.length > 0 ? elements.join('; ') : ' ') + '\n';
			}
		}

		//category options
		if (metaData.categoryOptions && metaData.categoryOptions.length > 0) {
			content += '\n## Data Element Category Options\n'
			content += 'Name | Last updated | UID\n'
			content += '--- | --- | --- \n'

			var co;
			for (var i = 0; i < metaData.categoryOptions.length; i++) {
				co = metaData.categoryOptions[i];
				content += co.name + ' | ' + co.lastUpdated.substr(0,10) + ' | ' + co.id + '\n';
			}
		}

		//categoryOptionCombos
		if (metaData.categoryOptionCombos && metaData.categoryOptionCombos.length > 0) {
			content += '\n## Category Option Combination\n'
			content += 'Name | Last updated | UID\n'
			content += '--- | --- | --- \n'

			var coc;
			for (var i = 0; i < metaData.categoryOptionCombos.length; i++) {
				coc = metaData.categoryOptionCombos[i];
				content += coc.name + ' | ' + coc.lastUpdated.substr(0,10) + ' | ' + coc.id + '\n';
			}
		}

		//categoryOptionGroupSets
		if (metaData.categoryOptionGroupSets && metaData.categoryOptionGroupSets.length > 0) {
			content += '\n## Category Option Group Sets\n'
			content += 'Name | Last updated | UID\n'
			content += '--- | --- | --- \n'

			var cogs;
			for (var i = 0; i < metaData.categoryOptionGroupSets.length; i++) {
				cogs = metaData.categoryOptionGroupSets[i];
				content += cogs.name + ' | ' + cogs.lastUpdated.substr(0,10) + ' | ' + cogs.id + '\n';
			}
		}

		//categoryOptionGroups
		if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
			content += '\n## Category Option Groups\n'
			content += 'Name | Shortname | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			for (var j = 0; metaData.categoryOptionGroups && j < metaData.categoryOptionGroups.length; j++) {
				item = metaData.categoryOptionGroups[j];
				content += item.name + ' | ' + item.shortName + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';

			}

			content += '### Category Option Group Sets - Category Option Groups\n'
			content += 'Category Option Group Sets | Category Option Groups\n'
			content += '--- | --- \n'
			var item, cog;
			for (var j = 0; metaData.categoryOptionGroupSets && j < metaData.categoryOptionGroupSets.length; j++) {
				item = metaData.categoryOptionGroupSets[j];
				for (var k = 0; k < item.categoryOptionGroups.length; k++) {
					cog = item.categoryOptionGroups[k];
					for (var l = 0; l < metaData.categoryOptionGroups.length; l++) {
						if (cog.id === metaData.categoryOptionGroups[l].id) {
							content += item.name + ' | ' + metaData.categoryOptionGroups[l].name + '\n';
						}
					}
				}
			}
		}

		//validation rules
		if (metaData.validationRules && metaData.validationRules.length > 0) {
			content += '\n## Validation Rules\n'
			content += 'Name | Instruction | Left side | Operator | Right side | Last updated | UID\n'
			content += '--- | --- | --- | --- | --- | --- | --- \n'

			for (var i = 0; i < metaData.validationRules.length; i++) {
				var vr = metaData.validationRules[i];

				content += vr.name + ' | ' + vr.instruction + ' | ' + vr.leftSide.description + ' | ' + vr.operator + ' | ' + vr.rightSide.description + ' | ' + vr.lastUpdated.substr(0,10) + ' | ' + vr.id + '\n';
			}
		}

		//predictors
		if (metaData.predictors && metaData.predictors.length > 0) {
			content += '\n## Predictors\n'
			content += 'Name | Generator | Sequential samples | Annual samples | Target data element | Last updated | UID\n'
			content += '--- | --- | --- | --- | --- | --- | --- \n'

			var pred;
			for (var i = 0; i < metaData.predictors.length; i++) {
				pred = metaData.predictors[i];

				var targetName = '';
				for (var j = 0; metaData.dataElements && j < metaData.dataElements.length; j++) {
					if (metaData.dataElements[j].id === pred.output.id) targetName = metaData.dataElements[j].name;
				}
				content += pred.name + ' | ';
				content += pred.generator.description + ' | ';
				content += pred.sequentialSampleCount + ' | ';
				content += pred.annualSampleCount + ' | ';
				content += targetName + ' | ';
				content += pred.lastUpdated.substr(0,10) + ' | ' + pred.id + '\n';
			}
		}

		//indicators: name, shortname, description, numeratorDescription, denominatorDescription, type, uid
		if (metaData.indicators && metaData.indicators.length > 0) {
			content += '\n## Indicators\n'
			content += 'Name | Shortname | Description | Numerator | Denominator | Type | Last updated | UID \n'
			content += '--- | --- | --- | --- | --- | --- | --- | --- \n'

			var ind, type;
			for (var i = 0; i < metaData.indicators.length; i++) {
				ind = metaData.indicators[i];

				for (var j = 0; j < metaData.indicatorTypes.length; j++) {
					if (ind.indicatorType.id == metaData.indicatorTypes[j].id) {
						type = metaData.indicatorTypes[j].name;
						break;
					}
				}

				content += ind.name + ' | ' + ind.shortName + ' | ' + (ind.description ? ind.description : ' ') + ' | ' +
					ind.numeratorDescription + ' | ' + ind.denominatorDescription + ' | ' + type + ' | ' + (ind.lastUpdated ? ind.lastUpdated.substr(0,10) : '') + ' | ' + ind.id + '\n';
			}
		}

		//indicator groups
		if (metaData.indicatorGroups && metaData.indicatorGroups.length > 0) {
			content += '\n## Indicator Groups\n'
			content += 'Name | Shortname | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			for (var j = 0; metaData.indicatorGroups && j < metaData.indicatorGroups.length; j++) {
				item = metaData.indicatorGroups[j];
				content += item.name + ' | ' + item.shortName + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';

			}

			content += '### Indicator Groups - Indicators\n'
			content += 'Indicator Group | Indicator\n'
			content += '--- | --- \n'
			var item, elements;
			for (var j = 0; metaData.indicatorGroups && j < metaData.indicatorGroups.length; j++) {
				item = metaData.indicatorGroups[j];
				for (var k = 0; k < item.indicators.length; k++) {
					de = item.indicators[k];
					for (var l = 0; l < metaData.indicators.length; l++) {
						if (de.id === metaData.indicators[l].id) {
							content += item.name + ' | ' + metaData.indicators[l].name + '\n';
						}
					}
				}
			}
		}

		//indicatorTypes
		if (metaData.indicatorTypes && metaData.indicatorTypes.length > 0) {
			content += '\n## Indicator types\n'
			content += 'Name | Factor | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			var it;
			for (var i = 0; i < metaData.indicatorTypes.length; i++) {
				it = metaData.indicatorTypes[i];
				content += it.name + ' | ' + it.factor + ' | ' + (it.lastUpdated ? it.lastUpdated.substr(0,10) : '') + ' | ' + it.id + '\n';
			}
		}

		//dashboards and dashboard items
		if (metaData.dashboards && metaData.dashboards.length > 0) {
			var db, dbi;
			content += '\n## Dashboards\n'
			for (var i = 0; i < metaData.dashboards.length; i++) {
				db = metaData.dashboards[i];

				content += '### ' + db.name + ' \n';
				content += 'Property | Value \n --- | --- \n';
				content += 'Name: | ' + db.name + '\n';
				content += 'Last updated: | ' + db.lastUpdated.substr(0,10) + '\n';
				content += 'UID: | ' + db.id+ '\n';



				content += '#### Dashboard items\n';
				content += 'Content/item type | Content name | Content UID | Last updated | Dashboard Item UID \n';
				content += '--- | --- | --- | --- | ---\n';


				for (var j = 0; j < db.dashboardItems.length; j++) {
					for (var l = 0; l < metaData.dashboardItems.length; l++) {
						if (db.dashboardItems[j].id === metaData.dashboardItems[l].id) {
							dbi = metaData.dashboardItems[l];
							var type, name, id;
							if (dbi.chart) {
								type = 'Chart';
								for (var k = 0; k < metaData.charts.length; k++) {
									if (dbi.chart.id === metaData.charts[k].id) {
										name = metaData.charts[k].name;
										id = metaData.charts[k].id;
										break;
									}
								}
							}
							else if (dbi.map) {
								type = 'Map';
								for (var k = 0; k < metaData.maps.length; k++) {
									if (dbi.map.id === metaData.maps[k].id) {
										name = metaData.maps[k].name;
										id = metaData.maps[k].id;
										break;
									}
								}
							}
							else if (dbi.reportTable) {
								type = 'Pivot table';
								for (var k = 0; k < metaData.reportTables.length; k++) {
									if (dbi.reportTable.id === metaData.reportTables[k].id) {
										name = metaData.reportTables[k].name;
										id = metaData.reportTables[k].id;
										break;
									}
								}
							}
							else if (dbi.resources.length > 0) {
								type = 'Resource (shortcuts)';
								name = ' ';
								id = ' ';
							}
							else if (dbi.reports.length > 0) {
								type = 'Report (shortcuts)';
								name = ' ';
								id = ' ';
							}
							content += type + ' | ' + name + ' | ' + id + ' | ' + dbi.lastUpdated.substr(0,10) + ' | ' + dbi.id + '\n';
						}
					}
				}
			}
		}

		//charts
		if (metaData.charts && metaData.charts.length > 0) {
			content += '\n## Charts\n'
			content += 'Name | Description | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			for (var i = 0; i < metaData.charts.length; i++) {
				var item = metaData.charts[i];
				content += item.name + ' | ' + (item.description ? item.description : ' ') + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';
			}
		}

		//pivottables
		if (metaData.reportTables && metaData.reportTables.length > 0) {
			content += '\n## Report tables\n'
			content += 'Name | Description | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			for (var i = 0; i < metaData.reportTables.length; i++) {
				var item = metaData.reportTables[i];
				content += item.name + ' | ' + (item.description ? item.description : ' ') + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';
			}
		}

		//maps and map view
		if (metaData.maps && metaData.maps.length > 0) {
			content += '\n## Maps\n'
			content += 'Name | Description | Last updated | UID\n'
			content += '--- | --- | --- | --- \n'

			for (var i = 0; i < metaData.maps.length; i++) {
				var item = metaData.maps[i];
				content += item.name + ' | ' + (item.description ? item.description : ' ') + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';
			}

			//mapviews
			if (metaData.mapViews && metaData.mapViews.length > 0) {
				content += '### Map views\n'
				content += 'Parent map name | Parent map UID | Last updated | UID\n'
				content += '--- | --- | --- | --- \n'

				for (var k = 0; k < metaData.mapViews.length; k++) {
					var mv = metaData.mapViews[k];
					for (var i = 0; i < metaData.maps.length; i++) {
						var item = metaData.maps[i];
						for (var j = 0; j < item.mapViews.length; j++) {
							if (mv.id === item.mapViews[j].id) {
								content += item.name + ' | ' + item.id + ' | ' + mv.lastUpdated.substr(0,10) + ' | ' + mv.id + '\n';
							}
						}
					}
				}
			}
		}

		//reports
		if (metaData.reports && metaData.reports.length > 0) {
			content += '\n## Standard reports\n'
			content += 'Name | Last updated | UID\n'
			content += '--- | --- | --- \n'

			for (var i = 0; i < metaData.reports.length; i++) {
				var item = metaData.reports[i];
				content += item.name + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';
			}
		}

		//resources
		if (metaData.documents && metaData.documents.length > 0) {
			content += '\n## Resources\n'
			content += 'Name | Last updated | UID\n'
			content += '--- | --- | --- \n'

			for (var i = 0; i < metaData.documents.length; i++) {
				var item = metaData.documents[i];
				content += item.name + ' | ' + item.lastUpdated.substr(0,10) + ' | ' + item.id + '\n';
			}
		}

		//legend sets and legends
		if (metaData.legendSets && metaData.legendSets.length > 0) {
			content += '\n## Legend Sets\n'

			var legendSet, legend;
			for (var i = 0; i < metaData.legendSets.length; i++) {
				legendSet = metaData.legendSets[i];

				content += '\n\n### ' + legendSet.name + ' \n';
				content += 'Property | Value \n --- | --- \n';
				content += 'Name: | ' + legendSet.name + '\n';
				content += 'Last updated: | ' + legendSet.lastUpdated.substr(0,10) + '\n';
				content += 'UID: | ' + legendSet.id+ '\n';


				content += '\n#### Legends\n';
				content += 'Name | Start | End | Last updated | UID \n';
				content += '--- | --- | --- | --- | ---\n';


				for (var j = 0; j < legendSet.legends.length; j++) {
					for (var l = 0; l < metaData.legends.length; l++) {
						if (legendSet.legends[j].id === metaData.legends[l].id) {
							var item = metaData.legends[l];
							content += item.name + ' | ' + item.startValue + ' | ' + item.endValue + ' | ' + item.lastUpdated + ' | ' + item.id + '\n';
						}
					}
				}
			}
		}

		fs.writeFile(currentExport.output + '_reference.md', content, function(err) {
			if(err) {
				return console.log(err);
			}

			console.log("Metadata reference saved");
			deferred.resolve(true);
		});

		return deferred.promise;

	}

	function makeIndicatorChecklist() {
		var deferred = Q.defer();

		var content = '# Configuration checklist\n';
		var table;


		//indicators
		if (metaData.indicators && metaData.indicators.length > 0) {
			table = [];
			table.push(['Name', 'Replace', 'Config', 'Remove']);

			var ind, type;
			for (var i = 0; i < metaData.indicators.length; i++) {
				ind = metaData.indicators[i];

				table.push([ind.name, '▢', '▢', '▢']);
			}

			content += '\n## Indicators \n'
			content += htmlTableFromArray(table, true, [70, 10, 10, 10], ['left', 'center', 'center', 'center']);
		}

		//category option group sets
		if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
			table = [];
			table.push(['Name', 'Config']);

			var cog, type;
			for (var i = 0; i < metaData.categoryOptionGroups.length; i++) {
				cog = metaData.categoryOptionGroups[i];

				table.push([cog.name, '▢']);
			}

			content += '\n## Category Option Groups \n'
			content += htmlTableFromArray(table, true, [90, 10], ['left', 'center']);
		}

		var types = ['charts', 'maps', 'reportTables'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; i < metaData[types[k]].length; i++) {

				var list = metaData[types[k]];
				if (list && list.length > 0) {
					var title;
					switch (types[k]) {
						case 'charts':
							title = 'Data Visualizer favourites';
							break;
						case 'maps':
							title = 'GIS favourites';
							break;
						case 'reportTables':
							title = 'Pivot Table favourites';
							break;
					}

					table = [];
					table.push(['Name', 'Action', 'Description', 'Done', 'Remove']);

					for (var i = 0; i < list.length; i++) {
						var item = list[i];

						var type = 'Review';
						if (favoriteModifications[item.id]) {
							if (favoriteModifications[item.id].dataSet && favoriteModifications[item.id].category) {
								type = "Category, Completeness";
							}
							else if (favoriteModifications[item.id].dataSet) {
								type = "Completeness";
							}
							else {
								type = "Category";
							}
						}

						var desc = item.description ? item.description.replace(/\n/g, "<br />") : '';
						table.push([item.name , type, desc, '▢', '▢']);
					}

					content += '\n## ' + title + ' \n';
					content += htmlTableFromArray(table, true, [40, 10, 30, 10, 10], ['left', 'left', 'left', 'center', 'center']);
				}
			}
		}


		fs.writeFile(currentExport.output + '_checklist.md', content, function(err) {
			if(err) {
				return console.log(err);
			}

			console.log("Configuration checklist saved");
			deferred.resolve(true);
		});

		return deferred.promise;
	}

	function saveFileJson() {
		var deferred = Q.defer();

		//Save file
		var data = JSON.stringify(metaData);
		fs.writeFile(currentExport.output + '.json', data, function(err) {
			if(err) {
				return console.log(err);
			}

			console.log("Metadata saved");
			deferred.resolve(true);
		});

		return deferred.promise;
	}

	function sortMetaData() {
		var objects = arrayFromKeys(metaData);
		var items;
		for (var i = 0; i < objects.length; i++) {
			if (metaData[objects[i]].length === 0) {
				continue;
			}
			items = metaData[objects[i]];

			if (items[0].hasOwnProperty('name')) {
				metaData[objects[i]] = arraySortByProperty(items, 'name', false, false);
			}
		}
	}

	//Use HTML for tables, so ensure support for newlines etc
	function htmlTableFromArray(content, header, columnWidths, alignment) {

		if (content.length < 1 || !columnWidths || columnWidths.length != content[0].length) {
			console.log("Invalid parameters - need at least header");
			return '';
		}

		var tableWidth = 100
		var table = '\n<table width="' + tableWidth + '%">\n';
		if (columnWidths) {
			for (var i = 0; i < columnWidths.length; i++) {
				table += '\t<col width="' + columnWidths[i] + '%">\n';
			}
		}

		if (header) {
			table += '\t<tr>\n';
			for (var i = 0; i < content[0].length; i++) {
				table += '\t\t<th>' + content[0][i] + '</th>\n';
			}
			table += '\t</tr>\n';
		}

		for (var i = 1; i < content.length; i++) {
			table += '\t<tr>\n';
			for (var j = 0; j < content[i].length; j++) {
				if (alignment) table += '\t\t<td align="' + alignment[j] + '">' + content[i][j] + '</td>\n';
				else table += '\t\t<td>' + content[i][j] + '</td>\n';
			}
			table += '\t</tr>\n';
		}

		table += '</table>\n\n';

		return table;
	}

	function plainIdsFromObjects(idObjects) {
		var ids = [];
		for (var i = 0; i < idObjects.length; i++) {
			ids.push(idObjects[i].id);
		}
		return ids;
	}

	function idsFromIndicatorFormula(numeratorFormula, denominatorFormula, dataElementOnly) {

		var matches = arrayMerge(numeratorFormula.match(/#{(.*?)}/g), denominatorFormula.match(/#{(.*?)}/g));
		if (!matches) return [];

		for (var i = 0; i < matches.length; i++ ) {
			matches[i] = matches[i].slice(2, -1);
			if (dataElementOnly) matches[i] = matches[i].split('.')[0];
		}

		return arrayRemoveDuplicates(matches);
	}

	function arrayRemoveDuplicates(array, property) {
		var seen = {};
		return array.filter(function(item) {
			if (property) {
				return seen.hasOwnProperty(item[property]) ? false : (seen[item[property]] = true);
			}
			else {
				return seen.hasOwnProperty(item) ? false : (seen[item] = true);
			}
		});
	}

	function arrayMerge(a, b) {
		if (a && !isArray(a)) a = [a];
		if (b && !isArray(b)) b = [b];

		if (!a && b) return b;
		if (!b && a) return a;

		for (var i = 0;a && b &&  i < b.length; i++) {
			a.push(b[i]);
		}
		return a;
	}

	function isArray(array) {
		var isArray = Object.prototype.toString.call( array ) === '[object Array]';

		return isArray;
	}

	function arraySortByProperty(array, property, numeric, reverse) {

		return array.sort(function(a, b) {
			var res;
			if (numeric) {
				res = b[property] - a[property] ;
			}
			else {
				res = a[property] < b[property] ? -1 : 1
			}
			if (reverse) return -res;
			else return res;
		});

	}

	function arrayFromKeys(obj) {
		var array = [];
		for (var key in obj) {
			if (obj.hasOwnProperty(key)) {
				array.push(key);
			}
		}
		return array;

	}


}());