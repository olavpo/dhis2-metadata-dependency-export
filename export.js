(function(){
	'use strict';

	var Q = require('q');
	var jsonfile = require('jsonfile');

	var conf = require('./conf/configuration.json');
	var d2 = require('./bin/d2.js');

	var metaData;
	run();

	/**
	 * Start the export
	 */
	function run() {
		metaData = {};

		if (conf.export.type === 'completeAggregate') {
			exportCompleteAggregate();
		}
	}


	/** COMPLETE **/
	function exportCompleteAggregate() {
		var promises = [];

		//Get dataSets and dashboards
		promises.push(object('dataSets', conf.export.dataSetIds));
		promises.push(object('dashboards', conf.export.dashboardIds));
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

						//Get indicators, based on favorites and datasets
						indicators().then(function(result) {
							metaData.indicators = result.indicators;

							//Get data elements, based on favorites, datasets and indicators
							dataElements().then(function(result) {
								metaData.dataElements = result.dataElements;

								//Get LegendSet, categoryCombo, indicatorTypes
								promises = [];
								promises.push(legendSets());
								promises.push(categoryCombos());
								promises.push(indicatorTypes());
								Q.all(promises).then(function(results) {
									metaData.legendSets = results[0].legendSets;
									metaData.categoryCombos = results[1].categoryCombos;
									metaData.indicatorTypes = results[2].indicatorTypes;

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

											console.log("Done exporting");
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
	}

	function exportCompleteAggregatePostProcess() {

		//Remove "user", "userGroupAccesses" for applicable objects, set publicaccess according to configuration.json
		for (var objectType in metaData) {
			var obj = metaData[objectType];
			for (var j = 0; j < obj.length; j++) {
				if (obj[j].hasOwnProperty('user')) delete obj[j].user;
				if (obj[j].hasOwnProperty('userGroupAccesses')) delete obj[j].userGroupAccesses;
				if (obj[j].hasOwnProperty('publicAccess')) obj[j].publicAccess = conf.export.publicAccess;

			}
		}

		//Remove orgunit assignment from datasets
		for (var i = 0; i < metaData.dataSets.length; i++) {
			metaData.dataSets[i].organisationUnits = [];
		}


		//Check for hardcoded orgunits in favorites (mapViews, reportTables, charts), print warning
		//Consider replacing by "user orgunit children or similar"
		for (var i = 0; i < metaData.charts.length; i++) {
			var chart = metaData.charts[i];
			if (chart.organisationUnits.length > 0) console.log("ERROR: chart " + chart.name + " (" + chart.id + ") uses fixed orgunits");
			if (chart.organisationUnitLevels.length > 0) console.log("WARNING: chart " + chart.name + " (" + chart.id + ") uses orgunit levels");
			if (chart.organisationUnitGroups.length > 0) console.log("WARNING: chart " + chart.name + " (" + chart.id + ") uses orgunit groups");
		}
		for (var i = 0; i < metaData.reportTables.length; i++) {
			var reportTable = metaData.reportTables[i];
			if (reportTable.organisationUnits.length > 0) console.log("ERROR: reportTable " + reportTable.name + " (" + reportTable.id + ") uses fixed orgunits");
			if (reportTable.organisationUnitLevels.length > 0) console.log("WARNING: reportTable " + reportTable.name + " (" + reportTable.id + ") uses orgunit levels");
			if (reportTable.organisationUnitGroups.length > 0) console.log("WARNING: reportTable " + reportTable.name + " (" + reportTable.id + ") uses orgunit groups");
		}
		var mapViewIssues = [];
		for (var i = 0; i < metaData.mapViews.length; i++) {
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


		//Check for (currently) unsupported favorites types, e.g. data element group sets etc






		//Save file
		jsonfile.writeFile(conf.output, metaData, function (err) {
			if (!err) console.log("Saved metadata to " + conf.output);
			else {
				console.log("Error saving metadata file:");
				console.error(err);
			}
		});
	}


	//Generic "object by ID" function
	function object(object, ids) {
		ids = arrayRemoveDuplicates(ids);
		return d2.get('/api/' + object + '.json?filter=id:in:[' + ids.join(',') + ']&fields=:owner&paging=false');
	}

	//Specific objects
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
		return d2.get('/api/sections.json?filter=dataSet.id:in:[' + conf.export.dataSetIds.join(',') + ']&fields=:owner&paging=false');
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
		for (var i = 0; i < metaData.dataSets.length; i++) {
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

	function dataElements() {
		var ids = [];

		//Data elements from datasets
		for (var i = 0; i < metaData.dataSets.length; i++) {
			for (var j = 0; j < metaData.dataSets[i].dataSetElements.length; j++) {
				ids.push(metaData.dataSets[i].dataSetElements[j].dataElement.id);
			}
		}

		//Data elements from favorites
		var types = ['charts', 'mapViews', 'reportTables'];
		for (var k = 0; k < types.length; k++) {
			for (var i = 0; i < metaData[types[k]].length; i++) {
				for (var j = 0; j < metaData[types[k]][i].dataDimensionItems.length; j++) {
					if (metaData[types[k]][i].dataDimensionItems[j].dataDimensionItemType.indexOf('DATA_ELEMENT') === 0) {
						ids.push(metaData[types[k]][i].dataDimensionItems[j].dataElement.id);
					}
				}
			}
		}

		//Data elements from indicator formulas
		for (var i = 0; i < metaData.indicators.length; i++) {
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
				for (var i = 0; i < metaData[types[k]].length; i++) {
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



	/** UTILS **/
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


}());