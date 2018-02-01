'use strict';

var fs = require("fs");
var Q = require('q');
var utils = require('./utils.js');

module.exports.makeReferenceList = makeReferenceList;
module.exports.makeConfigurationChecklist = makeConfigurationChecklist;


//Read metadata and make a Table of Content in markdown format
function makeReferenceList(fileName, metaData) {
	var deferred = Q.defer();

	//Make index over all object types, so that we can keep track of which ones
	//have been written to the reference doc
	var referenced = {};
	for (var object in metaData) {
		referenced[object] = false;
	}

	var content = "# Metadata reference\n";

	//dataset: sections, custom form bool, data elements, uid
	if (metaData.dataSets && metaData.dataSets.length > 0) {
		referenced["dataSets"] = true;
		referenced["sections"] = true;
		referenced["dataEntryForms"] = true;
		
		var ds, sec, de;
		content += "\n## Data sets\n";
		for (var i = 0; i < metaData.dataSets.length; i++) {
			ds = metaData.dataSets[i];

			content += "### " + ds.name + " \n";
			content += "Property | Value \n --- | --- \n";
			content += "Name: | " + ds.name + "\n";
			content += "Custom form: | " + (ds.dataEntryForm ? ds.dataEntryForm.id : "No") + "\n";
			content += "Last updated: | " + ds.lastUpdated.substr(0,10) + "\n";
			content += "UID: | " + ds.id+ "\n";

			var secHeader = false;
			for (var j = 0; metaData.sections && j < metaData.sections.length; j++) {
				sec = metaData.sections[j];
				if (sec.dataSet.id == ds.id) {

					if (!secHeader) {
						secHeader = true;
						content += "#### Sections\n";
						content += "Section | Last updated | UID\n";
						content += "--- | --- | ---\n";
					}

					content += sec.name + " | " + sec.lastUpdated.substr(0,10) + " | " + sec.id + "\n";
				}
			}

			content += "#### Data Set - Data Set Section - Data Element\n";
			content += "Data Set | Data Set Section | Data Element\n";
			content += "--- | --- | ---\n";
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

				content += ds.name + " | " + section + " | " + de.name + "\n";
			}
		}
	}

	//data elements: name, shortname, description, categorycombo, uid
	if (metaData.dataElements && metaData.dataElements.length > 0) {
		referenced["dataElements"] = true;
		
		content += "\n## Data Elements\n";
		content += "Name | Shortname | Description | Categorycombo | Last updated | UID\n";
		content += "--- | --- | --- | --- | --- | --- \n";

		for (var i = 0; i < metaData.dataElements.length; i++) {
			de = metaData.dataElements[i];

			var comboName;
			for (var j = 0; j < metaData.categoryCombos.length; j++) {

				if (de.categoryCombo.id === metaData.categoryCombos[j].id) {
					comboName = metaData.categoryCombos[j].name;
					j = metaData.categoryCombos.length;
				}
			}

			content += de.name + " | " + de.shortName + " | " + (de.description ? de.description : "_") + " | " + comboName + " | " + de.lastUpdated.substr(0,10) + " | " + de.id + "\n";
		}
	}

	//data element groups
	if (metaData.dataElementGroups && metaData.dataElementGroups.length > 0) {
		referenced["dataElementGroups"] = true;				
				
		content += "\n## Data Element Groups\n";
		content += "Name | Shortname | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var j = 0; metaData.dataElementGroups && j < metaData.dataElementGroups.length; j++) {
			item = metaData.dataElementGroups[j];
			content += item.name + " | " + item.shortName + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";

		}

		content += "### Data Element Groups - Data Elements\n";
		content += "Data Element Group | Data Element\n";
		content += "--- | --- \n";
		var item, elements;
		for (var j = 0; metaData.dataElementGroups && j < metaData.dataElementGroups.length; j++) {
			item = metaData.dataElementGroups[j];
			for (var k = 0; k < item.dataElements.length; k++) {
				de = item.dataElements[k];
				for (var l = 0; l < metaData.dataElements.length; l++) {
					if (de.id === metaData.dataElements[l].id) {
						content += item.name + " | " + metaData.dataElements[l].name + "\n";
					}
				}
			}


		}
	}

	//categorycombos
	if (metaData.categoryCombos && metaData.categoryCombos.length > 0) {
		referenced["categoryCombos"] = true;
		
		content += "\n## Category Combinations\n";
		content += "Name | Last updated | UID | Categories\n";
		content += "--- | --- | --- | --- \n";

		var cc, dec, elements;
		for (var i = 0; i < metaData.categoryCombos.length; i++) {
			cc = metaData.categoryCombos[i];
			elements = [];

			for (var j = 0; j < cc.categories.length; j++) {
				for (var k = 0; k < metaData.categories.length; k++) {
					if (cc.categories[j].id == metaData.categories[k].id) elements.push(metaData.categories[k].name);
				}
			}

			content += cc.name + " | " + cc.lastUpdated.substr(0,10) + " | " + cc.id + " | " + (elements.length > 0 ? elements.join("; ") : " ") + "\n";
		}
	}

	//categories
	if (metaData.categories && metaData.categories.length > 0) {
		referenced["categories"] = true;
		
		content += "\n## Data Element Categories\n";
		content += "Name | Last updated | UID | Category options\n";
		content += "--- | --- | --- | --- \n";

		var dec, co, elements;
		for (var i = 0; i < metaData.categories.length; i++) {
			dec = metaData.categories[i];
			elements = [];

			for (var j = 0; j < dec.categoryOptions.length; j++) {
				for (var k = 0; k < metaData.categoryOptions.length; k++) {
					if (dec.categoryOptions[j].id == metaData.categoryOptions[k].id) elements.push(metaData.categoryOptions[k].name);
				}
			}

			content += dec.name + " | " + dec.lastUpdated.substr(0,10) + " | " + dec.id + " | " + (elements.length > 0 ? elements.join("; ") : " ") + "\n";
		}
	}

	//category options
	if (metaData.categoryOptions && metaData.categoryOptions.length > 0) {
		referenced["categoryOptions"] = true;
		
		content += "\n## Data Element Category Options\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		var co;
		for (var i = 0; i < metaData.categoryOptions.length; i++) {
			co = metaData.categoryOptions[i];
			content += co.name + " | " + co.lastUpdated.substr(0,10) + " | " + co.id + "\n";
		}
	}

	//categoryOptionCombos
	if (metaData.categoryOptionCombos && metaData.categoryOptionCombos.length > 0) {
		referenced["categoryOptionCombos"] = true;
		
		content += "\n## Category Option Combination\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		var coc;
		for (var i = 0; i < metaData.categoryOptionCombos.length; i++) {
			coc = metaData.categoryOptionCombos[i];
			content += coc.name + " | " + coc.lastUpdated.substr(0,10) + " | " + coc.id + "\n";
		}
	}

	//categoryOptionGroupSets
	if (metaData.categoryOptionGroupSets && metaData.categoryOptionGroupSets.length > 0) {
		referenced["categoryOptionGroupSets"] = true;
		
		content += "\n## Category Option Group Sets\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		var cogs;
		for (var i = 0; i < metaData.categoryOptionGroupSets.length; i++) {
			cogs = metaData.categoryOptionGroupSets[i];
			content += cogs.name + " | " + cogs.lastUpdated.substr(0,10) + " | " + cogs.id + "\n";
		}
	}

	//categoryOptionGroups
	if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
		referenced["categoryOptionGroups"] = true;
		
		content += "\n## Category Option Groups\n";
		content += "Name | Shortname | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var j = 0; metaData.categoryOptionGroups && j < metaData.categoryOptionGroups.length; j++) {
			item = metaData.categoryOptionGroups[j];
			content += item.name + " | " + item.shortName + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";

		}

		content += "### Category Option Group Sets - Category Option Groups\n";
		content += "Category Option Group Sets | Category Option Groups\n";
		content += "--- | --- \n";
		var item, cog;
		for (var j = 0; metaData.categoryOptionGroupSets && j < metaData.categoryOptionGroupSets.length; j++) {
			item = metaData.categoryOptionGroupSets[j];
			for (var k = 0; k < item.categoryOptionGroups.length; k++) {
				cog = item.categoryOptionGroups[k];
				for (var l = 0; l < metaData.categoryOptionGroups.length; l++) {
					if (cog.id === metaData.categoryOptionGroups[l].id) {
						content += item.name + " | " + metaData.categoryOptionGroups[l].name + "\n";
					}
				}
			}
		}
	}

	//validation rules
	if (metaData.validationRules && metaData.validationRules.length > 0) {
		referenced["validationRules"] = true;
		
		content += "\n## Validation Rules\n";
		content += "Name | Instruction | Left side | Operator | Right side | Last updated | UID\n";
		content += "--- | --- | --- | --- | --- | --- | --- \n";

		for (var i = 0; i < metaData.validationRules.length; i++) {
			var vr = metaData.validationRules[i];

			content += vr.name + " | " + vr.instruction + " | " + vr.leftSide.description + " | " + vr.operator + " | " + vr.rightSide.description + " | " + vr.lastUpdated.substr(0,10) + " | " + vr.id + "\n";
		}
	}
	

	//indicator groups
	if (metaData.validationRuleGroups && metaData.validationRuleGroups.length > 0) {
		referenced["validationRuleGroups"] = true;
		
		content += "\n## Validation Rule Groups\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		for (var j = 0; metaData.validationRuleGroups && j < metaData.validationRuleGroups.length; j++) {
			item = metaData.validationRuleGroups[j];
			content += item.name + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";

		}

		content += "### Validation Rule Groups - Validation Rules\n";
		content += "Validation Rule Group | Validation Rule\n";
		content += "--- | --- \n";
		var item, elements;
		for (var j = 0; metaData.validationRuleGroups && j < metaData.validationRuleGroups.length; j++) {
			item = metaData.validationRuleGroups[j];
			for (var k = 0; k < item.validationRules.length; k++) {
				de = item.validationRules[k];
				for (var l = 0; l < metaData.validationRules.length; l++) {
					if (de.id === metaData.validationRules[l].id) {
						content += item.name + " | " + metaData.validationRules[l].name + "\n";
					}
				}
			}
		}
	}
	

	//predictors
	if (metaData.predictors && metaData.predictors.length > 0) {
		referenced["predictors"] = true;
		
		content += "\n## Predictors\n";
		content += "Name | Generator | Sequential samples | Annual samples | Target data element | Last updated | UID\n";
		content += "--- | --- | --- | --- | --- | --- | --- \n";

		var pred;
		for (var i = 0; i < metaData.predictors.length; i++) {
			pred = metaData.predictors[i];

			var targetName = "";
			for (var j = 0; metaData.dataElements && j < metaData.dataElements.length; j++) {
				if (metaData.dataElements[j].id === pred.output.id) targetName = metaData.dataElements[j].name;
			}
			content += pred.name + " | ";
			content += pred.generator.description + " | ";
			content += pred.sequentialSampleCount + " | ";
			content += pred.annualSampleCount + " | ";
			content += targetName + " | ";
			content += pred.lastUpdated.substr(0,10) + " | " + pred.id + "\n";
		}
	}

	//indicators: name, shortname, description, numeratorDescription, denominatorDescription, type, uid
	if (metaData.indicators && metaData.indicators.length > 0) {
		referenced["indicators"] = true;
		
		content += "\n## Indicators\n";
		content += "Name | Shortname | Description | Numerator | Denominator | Type | Last updated | UID \n";
		content += "--- | --- | --- | --- | --- | --- | --- | --- \n";

		var ind, type;
		for (var i = 0; i < metaData.indicators.length; i++) {
			ind = metaData.indicators[i];

			for (var j = 0; j < metaData.indicatorTypes.length; j++) {
				if (ind.indicatorType.id == metaData.indicatorTypes[j].id) {
					type = metaData.indicatorTypes[j].name;
					break;
				}
			}

			content += ind.name + " | " + ind.shortName + " | " + (ind.description ? ind.description : " ") + " | " +
				ind.numeratorDescription + " | " + ind.denominatorDescription + " | " + type + " | " + (ind.lastUpdated ? ind.lastUpdated.substr(0,10) : "") + " | " + ind.id + "\n";
		}
	}

	//indicator groups
	if (metaData.indicatorGroups && metaData.indicatorGroups.length > 0) {
		referenced["indicatorGroups"] = true;
		
		content += "\n## Indicator Groups\n";
		content += "Name | Shortname | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var j = 0; metaData.indicatorGroups && j < metaData.indicatorGroups.length; j++) {
			item = metaData.indicatorGroups[j];
			content += item.name + " | " + item.shortName + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";

		}

		content += "### Indicator Groups - Indicators\n";
		content += "Indicator Group | Indicator\n";
		content += "--- | --- \n";
		var item, elements;
		for (var j = 0; metaData.indicatorGroups && j < metaData.indicatorGroups.length; j++) {
			item = metaData.indicatorGroups[j];
			for (var k = 0; k < item.indicators.length; k++) {
				de = item.indicators[k];
				for (var l = 0; l < metaData.indicators.length; l++) {
					if (de.id === metaData.indicators[l].id) {
						content += item.name + " | " + metaData.indicators[l].name + "\n";
					}
				}
			}
		}
	}

	//indicatorTypes
	if (metaData.indicatorTypes && metaData.indicatorTypes.length > 0) {
		referenced["indicatorTypes"] = true;
		
		content += "\n## Indicator types\n";
		content += "Name | Factor | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		var it;
		for (var i = 0; i < metaData.indicatorTypes.length; i++) {
			it = metaData.indicatorTypes[i];
			content += it.name + " | " + it.factor + " | " + (it.lastUpdated ? it.lastUpdated.substr(0,10) : "") + " | " + it.id + "\n";
		}
	}

	//dashboards and dashboard items
	if (metaData.dashboards && metaData.dashboards.length > 0) {
		referenced["dashboards"] = true;
		referenced["dashboardItems"] = true;
	
		var db, dbi;
		content += "\n## Dashboards\n";
		for (var i = 0; i < metaData.dashboards.length; i++) {
			db = metaData.dashboards[i];

			content += "### " + db.name + " \n";
			content += "Property | Value \n --- | --- \n";
			content += "Name: | " + db.name + "\n";
			content += "Last updated: | " + db.lastUpdated.substr(0,10) + "\n";
			content += "UID: | " + db.id+ "\n";



			content += "#### Dashboard items\n";
			content += "Content/item type | Content name | Content UID | Last updated | Dashboard Item UID \n";
			content += "--- | --- | --- | --- | ---\n";


			for (var j = 0; j < db.dashboardItems.length; j++) {
				for (var l = 0; l < metaData.dashboardItems.length; l++) {
					if (db.dashboardItems[j].id === metaData.dashboardItems[l].id) {
						dbi = metaData.dashboardItems[l];
						var type, name, id;
						if (dbi.chart) {
							type = "Chart";
							for (var k = 0; k < metaData.charts.length; k++) {
								if (dbi.chart.id === metaData.charts[k].id) {
									name = metaData.charts[k].name;
									id = metaData.charts[k].id;
									break;
								}
							}
						}
						else if (dbi.map) {
							type = "Map";
							for (var k = 0; k < metaData.maps.length; k++) {
								if (dbi.map.id === metaData.maps[k].id) {
									name = metaData.maps[k].name;
									id = metaData.maps[k].id;
									break;
								}
							}
						}
						else if (dbi.reportTable) {
							type = "Pivot table";
							for (var k = 0; k < metaData.reportTables.length; k++) {
								if (dbi.reportTable.id === metaData.reportTables[k].id) {
									name = metaData.reportTables[k].name;
									id = metaData.reportTables[k].id;
									break;
								}
							}
						}
						else if (dbi.resources.length > 0) {
							type = "Resource (shortcuts)";
							name = " ";
							id = " ";
						}
						else if (dbi.reports.length > 0) {
							type = "Report (shortcuts)";
							name = " ";
							id = " ";
						}
						content += type + " | " + name + " | " + id + " | " + dbi.lastUpdated.substr(0,10) + " | " + dbi.id + "\n";
					}
				}
			}
		}
	}

	//charts
	if (metaData.charts && metaData.charts.length > 0) {
		referenced["charts"] = true;
		
		content += "\n## Charts\n";
		content += "Name | Description | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var i = 0; i < metaData.charts.length; i++) {
			var item = metaData.charts[i];
			content += item.name + " | " + (item.description ? item.description : " ") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}

	//pivottables
	if (metaData.reportTables && metaData.reportTables.length > 0) {
		referenced["reportTables"] = true;
		
		content += "\n## Report tables\n";
		content += "Name | Description | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var i = 0; i < metaData.reportTables.length; i++) {
			var item = metaData.reportTables[i];
			content += item.name + " | " + (item.description ? item.description : " ") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}

	//maps and map view
	if (metaData.maps && metaData.maps.length > 0) {
		referenced["maps"] = true;
		referenced["mapViews"] = true;
		
		content += "\n## Maps\n";
		content += "Name | Description | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var i = 0; i < metaData.maps.length; i++) {
			var item = metaData.maps[i];
			content += item.name + " | " + (item.description ? item.description : " ") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}

		//mapviews
		if (metaData.mapViews && metaData.mapViews.length > 0) {
			content += "### Map views\n";
			content += "Parent map name | Parent map UID | Last updated | UID\n";
			content += "--- | --- | --- | --- \n";

			for (var k = 0; k < metaData.mapViews.length; k++) {
				var mv = metaData.mapViews[k];
				for (var i = 0; i < metaData.maps.length; i++) {
					var item = metaData.maps[i];
					for (var j = 0; j < item.mapViews.length; j++) {
						if (mv.id === item.mapViews[j].id) {
							content += item.name + " | " + item.id + " | " + mv.lastUpdated.substr(0,10) + " | " + mv.id + "\n";
						}
					}
				}
			}
		}
	}

	//reports
	if (metaData.reports && metaData.reports.length > 0) {
		referenced["reports"] = true;
		
		content += "\n## Standard reports\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		for (var i = 0; i < metaData.reports.length; i++) {
			var item = metaData.reports[i];
			content += item.name + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}

	//resources
	if (metaData.documents && metaData.documents.length > 0) {
		referenced["documents"] = true;
		
		content += "\n## Resources\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		for (var i = 0; i < metaData.documents.length; i++) {
			var item = metaData.documents[i];
			content += item.name + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}

	//legend sets and legends
	if (metaData.legendSets && metaData.legendSets.length > 0) {
		referenced["legendSets"] = true;
		
		content += "\n## Legend Sets\n";

		var legendSet, legend;
		for (var i = 0; i < metaData.legendSets.length; i++) {
			legendSet = metaData.legendSets[i];

			content += "\n\n### " + legendSet.name + " \n";
			content += "Property | Value \n --- | --- \n";
			content += "Name: | " + legendSet.name + "\n";
			content += "Last updated: | " + legendSet.lastUpdated.substr(0,10) + "\n";
			content += "UID: | " + legendSet.id+ "\n";


			content += "\n#### Legends\n";
			content += "Name | Start | End | Last updated | UID \n";
			content += "--- | --- | --- | --- | ---\n";


			for (var j = 0; j < legendSet.legends.length; j++) {
				var item = legendSet.legends[j];
				content += item.name + " | " + item.startValue + " | " + 
					item.endValue + " | " + item.lastUpdated + " | " + item.id + "\n";
			}
		}
	}


	//Check if there are any objects missing. No point aborting, as .json is
	//already written - but show warning 
	for (var object in referenced) {
		if (!referenced[object]) {
			console.log('Warning: Not included in reference file: ' + object);
		}
	}
	

	fs.writeFile(fileName + "_reference.md", content, function(err) {
		if(err) {
			return console.log(err);
		}

		console.log("Metadata reference saved");
		deferred.resolve(true);
	});

	return deferred.promise;

}


//Read metadata and make checklist for indicator availability in markdown format
function makeConfigurationChecklist(fileName, metaData) {
	var deferred = Q.defer();

	var content = "# Configuration checklist\n";
	var table;


	//indicators
	if (metaData.indicators && metaData.indicators.length > 0) {
		table = [];
		table.push(["Name", "Configured"]);

		var ind, type;
		for (var i = 0; i < metaData.indicators.length; i++) {
			ind = metaData.indicators[i];

			table.push([ind.name, "▢"]);
		}

		content += "\n## Indicators \n";
		content += utils.htmlTableFromArray(table, true, [80, 20], ["left", "center"]);
	}

	//category option group sets
	if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
		table = [];
		table.push(["Name", "Configured"]);

		var cog, type;
		for (var i = 0; i < metaData.categoryOptionGroups.length; i++) {
			cog = metaData.categoryOptionGroups[i];

			table.push([cog.name, "▢"]);
		}

		content += "\n## Category Option Groups \n";
		content += utils.htmlTableFromArray(table, true, [80, 20], ["left", "center"]);
	}


	fs.writeFile(fileName + "_configuration.md", content, function(err) {
		if(err) {
			return console.log(err);
		}

		console.log("Configuration checklist saved");
		deferred.resolve(true);
	});

	return deferred.promise;
}
