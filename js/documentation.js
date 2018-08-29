"use strict";

var fs = require("fs");
var Q = require("q");
var utils = require("./utils.js");

module.exports.makeReferenceList = makeReferenceList;
module.exports.makeConfigurationChecklist = makeConfigurationChecklist;
module.exports.makeAvailabilityChecklist = makeAvailabilityChecklist;


//Read metadata and make a Table of Content in markdown format
function makeReferenceList(basePath, metaData) {
	var deferred = Q.defer();

	//Make index over all object types, so that we can keep track of which ones
	//have been written to the reference doc
	var referenced = {};
	for (var object in metaData) {
		referenced[object] = false;
	}

	var content = "# Metadata reference\n";

	content += metaData.package;
	referenced["package"] = true;


	//tracked entity types
	if (metaData.trackedEntityTypes && metaData.trackedEntityTypes.length > 0) {
		referenced["trackedEntityTypes"] = true;
		
		content += "\n## Tracked entity types\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		var tet;
		for (var i = 0; i < metaData.trackedEntityTypes.length; i++) {
			tet = metaData.trackedEntityTypes[i];
			content += tet.name + " | " + tet.lastUpdated.substr(0,10) + " | " + tet.id + "\n";
		}

		//tracked entity type attributes
		content += "\n### Tracked Entity Type - Tracked Entity Type Attributes\n";
		content += "Tracked Entity Type | Tracked Entity Type Attribute\n";
		content += "--- | ---\n";
		for (var i = 0; i < metaData.trackedEntityTypes.length; i++) {
			tet = metaData.trackedEntityTypes[i];
			for (var tea of tet.trackedEntityTypeAttributes) {
				content += tet.name + " | " + getName(tea.id, metaData) + "\n";
			}
		}
	}


	//tracked entity attributes
	if (metaData.trackedEntityAttributes && metaData.trackedEntityAttributes.length > 0) {
		referenced["trackedEntityAttributes"] = true;
		
		content += "\n## Tracked entity attributes\n";
		content += "Name | Code | Description | Last updated | UID\n";
		content += "--- | --- | --- | --- | --- \n";

		var tea;
		for (var tea of metaData.trackedEntityAttributes) {
			content += tea.name + " | " + (tea.code ? tea.code : "") + " | " + tea.description + " | " + tea.lastUpdated.substr(0,10) + " | " + tea.id + "\n";
		}
	}


	//dataset: sections, custom form bool, data elements, uid
	if (metaData.dataSets && metaData.dataSets.length > 0) {
		referenced["dataSets"] = true;
		referenced["sections"] = true;
		referenced["dataEntryForms"] = true;
		
		var ds, sec, de;
		content += "\n## Data sets\n";
		for (var i = 0; i < metaData.dataSets.length; i++) {
			ds = metaData.dataSets[i];

			var dsSec = sections(ds, metaData);

			content += "\n### " + ds.name + " \n";
			content += "Property | Value \n --- | --- \n";
			content += "Name: | " + ds.name + "\n";
			content += "Custom form: | " + (ds.dataEntryForm ? ds.dataEntryForm.id : "No") + "\n";
			content += "Sections: | " + (dsSec.length > 0 ? "Yes" : "No") + "\n";
			content += "Last updated: | " + ds.lastUpdated.substr(0,10) + "\n";
			content += "UID: | " + ds.id+ "\n";

			if (dsSec.length > 0) {
				content += "\n#### Sections\n";
				content += "Section | Last updated | UID\n";
				content += "--- | --- | ---\n";
					
				for (var sec of sections(ds, metaData)) {
					content += sec.name + " | " + sec.lastUpdated.substr(0,10) + " | " + sec.id + "\n";
				}
				
				content += "\n#### Data Set Section - Data Element\n";
				content += "Data Set Section | Data Element\n";
				content += "--- | ---\n";
				var dataSetSectionElementList = dataSetSectionElement(ds, metaData);
				for (var row of dataSetSectionElementList) {
					content+= row.section + " | " + row.dataElement + "\n";
				}
			}
			else {
				content += "\n#### Data Elements\n";
				content += "| Data Element |\n";
				content += "| --- |\n";
				var dataSetSectionElementList = dataSetSectionElement(ds, metaData);
				for (var row of dataSetSectionElementList) {
					content+= "| " + row.dataElement + " |\n";
				}
			}
		}
	}
	
	//programs: program stages, sections, custom form bool, data elements, uid
	if (metaData.programs && metaData.programs.length > 0 && metaData.programStages && metaData.programStages.length > 0) {
		referenced["programs"] = true;
		referenced["programStages"] = true;
		referenced["programStageSections"] = true;
		referenced["programStageDataElements"] = true;
		referenced["dataEntryForms"] = true;
		referenced["programRules"] = true;
		referenced["programRuleActions"] = true;
		referenced["programRuleVariables"] = true;
		referenced["programTrackedEntityAttributes"] = true;
		
		content += "\n## Programs\n";
		for (var h = 0; h < metaData.programs.length; h++) {
			var prog = metaData.programs[h];
			content += "\n### " + prog.name + "\n";
			content += "Property | Value \n --- | --- \n";
			content += "Name: | " + prog.name + "\n";
			if (prog.programType != "WITHOUT_REGISTRATION") content += "Tracked Entity Type: | " + getName(prog.trackedEntityType.id, metaData) + "\n";
			content += "Last updated: | " + prog.lastUpdated.substr(0,10) + "\n";
			content += "UID: | " + prog.id+ "\n";



			var ps, sec;
			content += "\n#### Program Stages\n";
			content += "Program Stage | Last updated | UID\n";
			content += "--- | --- | ---\n";
			for (var i = 0; i < prog.programStages.length; i++) {
				ps = metaData.programStages[i];
				for (var j = 0; j < metaData.programStages.length && !ps; j++) {
					if (prog.programStages[i].id == metaData.programStages[j].id) ps = metaData.programStages[j];
				}
				content+= ps.name + " | " + ps.lastUpdated.substr(0,10) + " | " + ps.id + "\n";
			}

			content += "\n#### Program Stage - Program Stage Section - Data Element\n";
			content += "Program Stage | Program Stage Section | Data Element\n";
			content += "--- | --- | ---\n";
	
			for (var ps of prog.programStages) {
				ps = getObject(ps.id, metaData);
				for (var psde of ps.programStageDataElements) {
					content += ps.name + " | " + programSectionFromStageAndElement(ps.id, psde.dataElement.id, metaData) + " | " + getName(psde.dataElement.id, metaData) + "\n";
				}
			}

			//Program indicators
	
			if (metaData.programIndicators && metaData.programIndicators.length > 0) {
				referenced["programIndicators"] = true;
				
				content += "\n## Program Indicators\n";
				content += "Name | Shortname | Code | Description | Analytics Type | Last updated | UID \n";
				content += "--- | --- | --- | --- | --- | --- | --- \n";

				var ind, type;
				for (var i = 0; i < metaData.programIndicators.length; i++) {
					ind = metaData.programIndicators[i];

					content += ind.name + " | " + ind.shortName + " | " + (ind.code ? ind.code : "") + " | " + (ind.description ? ind.description : " ") + " | " +
					ind.analyticsType + " | " + (ind.lastUpdated ? ind.lastUpdated.substr(0,10) : "") + " | " + ind.id + "\n";
				}
			}


			//Program rules
			var programRules = programProgramRules(prog.id, metaData);
			content += "\n#### Program Rules\n";
			content += "Program rule | Description | Last updated | UID\n";
			content += "--- | --- | --- | ---\n";
			for (var pr of programRules) {
				content += pr.name + " | " + pr.description + " | " + pr.lastUpdated.substr(0,10) + " | " + pr.id + "\n"; 
			}


			//Program tracked entity attributes
			content += "\n#### Program Tracked Entity Attributes\n";
			content += "Tracked Entity Attribute Name | Last updated | Program Tracked Entity Attribute UID | Tracked Entity Attribute UID\n";
			content += "--- | --- | ---\n";
			for (var ptea of prog.programTrackedEntityAttributes) {
				ptea = getObject(ptea.id, metaData);
				content += getName(ptea.trackedEntityAttribute.id, metaData) + ' | ' + ptea.lastUpdated.substr(0,10) + ' | ' + ptea.id  + ' | ' + ptea.trackedEntityAttribute.id + "\n";
			}
		}
	}

	

	//data elements: name, shortname, description, categorycombo, uid
	if (metaData.dataElements && metaData.dataElements.length > 0) {
		referenced["dataElements"] = true;
		
		content += "\n## Data Elements\n";
		content += "Name | Shortname | Code | Description | Categorycombo | Last updated | UID\n";
		content += "--- | --- | --- | --- |  --- | --- | --- \n";

		for (var i = 0; i < metaData.dataElements.length; i++) {
			de = metaData.dataElements[i];

			var comboName = getName(de.categoryCombo.id, metaData);
			content += de.name + " | " + de.shortName + " | " + (de.code ? de.code : "") + " | " + (de.description ? de.description : "") + " | " + comboName + " | " + de.lastUpdated.substr(0,10) + " | " + de.id + "\n";
		}
	}

	//data element groups
	if (metaData.dataElementGroups && metaData.dataElementGroups.length > 0) {
		referenced["dataElementGroups"] = true;				
				
		content += "\n## Data Element Groups\n";
		content += "Name | Shortname | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var item of metaData.dataElementGroups) {
			content += item.name + " | " + (item.shortName ? item.shortName : "") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";

		}

		content += "\n### Data Element Groups - Data Elements\n";
		content += "Data Element Group | Data Element\n";
		content += "--- | --- \n";
		var item, elements;
		for (var item of metaData.dataElementGroups) {
			for (var de of item.dataElements) {
				content += item.name + " | " + getName(de.id, metaData) + "\n";
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

	//optionSets
	if (metaData.optionSets && metaData.optionSets.length > 0) {
		referenced["optionSets"] = true;
		
		content += "\n## Option Sets\n";
		content += "Name | Last updated | UID | Options\n";
		content += "--- | --- | --- | --- \n";

		var os, co, elements;
		for (var i = 0; i < metaData.optionSets.length; i++) {
			os = metaData.optionSets[i];
			elements = [];

			
			for (var j = 0; j < os.options.length; j++) {
				for (var k = 0; k < metaData.options.length; k++) {
					if (os.options[j].id == metaData.options[k].id) elements.push(metaData.options[k].name);
				}
			}
			var elementText;
			if (elements.length > 20) {
				var notShown = elements.length - 20;
				elements.splice(20)
				elements.push("another " + notShown + " options not shown.");
			}
		
			elementText = elements.join("; ");
			content += os.name + " | " + os.lastUpdated.substr(0,10) + " | " + os.id + " | " + elementText + "\n";
		}
	}

	//options
	if (metaData.options && metaData.options.length > 0) {
		referenced["options"] = true;
		
		content += "\n## Options\n";
		content += "<table><tr><th>Name</th><th>Code</th><th>Last updated</th><th>UID</th></tr>"
		var opt;
		for (var i = 0; i < metaData.options.length; i++) {
			opt = metaData.options[i];
			content += "<tr><td>" + getName(opt.optionSet.id, metaData) + "</td><td>" + opt.name + "</td><td>" + opt.code + "</td><td>" + opt.lastUpdated.substr(0,10) + "</td><td>" + opt.id + "</td></tr>"
		}
		content += "</table>"
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

	//validation rule groups
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
	
	//indicators: name, shortname, description, numeratorDescription, denominatorDescription, type, uid
	if (metaData.indicators && metaData.indicators.length > 0) {
		referenced["indicators"] = true;
		
		content += "\n## Indicators\n";
		content += "Name | Shortname | Code | Description | Numerator | Denominator | Type | Last updated | UID \n";
		content += "--- | --- | --- | --- | --- | --- | --- | --- | --- \n";

		var ind, type;
		for (var i = 0; i < metaData.indicators.length; i++) {
			ind = metaData.indicators[i];

			for (var j = 0; j < metaData.indicatorTypes.length; j++) {
				if (ind.indicatorType.id == metaData.indicatorTypes[j].id) {
					type = metaData.indicatorTypes[j].name;
					break;
				}
			}

			content += ind.name + " | " + ind.shortName + " | " + (ind.code ? ind.code : "") + " | " + (ind.description ? ind.description : "") + " | " +
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
			content += item.name + " | " + (item.shortName ? item.shortName : "") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";

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

				//versions >= 2.29
				if (db.dashboardItems[j].hasOwnProperty("type")) {
					dbi = db.dashboardItems[j];
				}
				// versions < 2.29
				else {
					for (var l = 0; l < metaData.dashboardItems.length; l++) {
						if (db.dashboardItems[j].id === metaData.dashboardItems[l].id) {
							dbi = metaData.dashboardItems[l];
							break;
						}
					}
				}
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
				else if (dbi.eventReport) {
					type = "Event report";
					for (var k = 0; k < metaData.eventReports.length; k++) {
						if (dbi.eventReport.id === metaData.eventReports[k].id) {
							name = metaData.eventReports[k].name;
							id = metaData.eventReports[k].id;
							break;
						}
					}
				}
				else if (dbi.eventChart) {
					type = "Event chart";
					for (var k = 0; k < metaData.eventCharts.length; k++) {
						if (dbi.eventChart.id === metaData.eventCharts[k].id) {
							name = metaData.eventCharts[k].name;
							id = metaData.eventCharts[k].id;
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

	//eventReports
	if (metaData.eventReports && metaData.eventReports.length > 0) {
		referenced["eventReports"] = true;
		
		content += "\n## Event reports\n";
		content += "Name | Description | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var i = 0; i < metaData.eventReports.length; i++) {
			var item = metaData.eventReports[i];
			content += item.name + " | " + (item.description ? item.description : " ") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}


	//eventCharts
	if (metaData.eventCharts && metaData.eventCharts.length > 0) {
		referenced["eventCharts"] = true;
		
		content += "\n## Event charts\n";
		content += "Name | Description | Last updated | UID\n";
		content += "--- | --- | --- | --- \n";

		for (var i = 0; i < metaData.eventCharts.length; i++) {
			var item = metaData.eventCharts[i];
			content += item.name + " | " + (item.description ? item.description : " ") + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
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

		var legendSet;
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

	//user groups
	if (metaData.userGroups && metaData.userGroups.length > 0) {
		referenced["userGroups"] = true;
		
		content += "\n## User Groups\n";
		content += "Name | Last updated | UID\n";
		content += "--- | --- | --- \n";

		for (var i = 0; i < metaData.userGroups.length; i++) {
			var item = metaData.userGroups[i];
			content += item.name + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}

	//users
	if (metaData.users && metaData.users.length > 0) {
		referenced["users"] = true;
		
		content += "\n## Users\n";
		content += "Username | Last updated | UID\n";
		content += "--- | --- | --- \n";

		for (var i = 0; i < metaData.users.length; i++) {
			var item = metaData.users[i];
			content += item.userCredentials.username + " | " + item.lastUpdated.substr(0,10) + " | " + item.id + "\n";
		}
	}

	//Check if there are any objects missing. No point aborting, as .json is
	//already written - but show warning 
	for (var object in referenced) {
		if (!referenced[object]) {
			console.log("Warning: Not included in reference file: " + object);
		}
	}
	

	fs.writeFile(basePath + "/reference.md", content, function(err) {
		if(err) {
			console.log(err);
			deferred.resolve(false);
		}

		console.log("✔ Reference list saved");
		deferred.resolve(true);
	});

	return deferred.promise;

}


//Read metadata and make checklist for indicator availability in markdown format
function makeConfigurationChecklist(basePath, metaData) {
	var deferred = Q.defer();

	var content = "# Configuration checklist\n";
	var table;


	//indicators
	if (metaData.indicators && metaData.indicators.length > 0) {
		table = [];
		table.push(["Name", "Configured"]);

		var ind;
		for (var i = 0; i < metaData.indicators.length; i++) {
			ind = metaData.indicators[i];

			table.push([ind.name, "▢"]);
		}

		content += "\n## Indicators \n";
		content += utils.htmlTableFromArray(table, true, [85, 15], ["left", "center"]);
	}

	//category option group sets
	if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
		table = [];
		table.push(["Name", "Configured"]);

		var cog;
		for (var i = 0; i < metaData.categoryOptionGroups.length; i++) {
			cog = metaData.categoryOptionGroups[i];

			table.push([cog.name, "▢"]);
		}

		content += "\n## Category Option Groups \n";
		content += utils.htmlTableFromArray(table, true, [85, 15], ["left", "center"]);
	}


	fs.writeFile(basePath + "/configuration.md", content, function(err) {
		if(err) {
			console.log(err);
			deferred.resolve(false);
		}

		console.log("✔ Configuration checklist saved");
		deferred.resolve(true);
	});

	return deferred.promise;
}


//Read metadata and make checklist that can be used pre-implementation to 
//map the availability of data elements and/or indicators
function makeAvailabilityChecklist(basePath, metaData) {
	var deferred = Q.defer();

	var content = "# Availability mapping\n";

	//data elements
	if (metaData.dataSets && metaData.dataElements && metaData.dataElements.length > 0) {
		content += "\n## Data elements \n";
		
		for (var ds of metaData.dataSets) {
			content += "\n### " + ds.name + " \n";
			content += dataElementAvailabilityTable(dataElements(ds, metaData), metaData);
		}
		
		var unGrouped = standaloneDataElements(metaData);
		if (unGrouped.length > 0) {
			content += "\n### Other \n";
			content += dataElementAvailabilityTable(unGrouped, metaData);
		}
	}


	//indicators
	if (metaData.indicators && metaData.indicators.length > 0) {
		content += "\n## Indicators \n";
		content += indicatorAvailabilityTable(metaData);
	}


	fs.writeFile(basePath + "/availability.md", content, function(err) {
		if(err) {
			console.log(err);
			deferred.resolve(false);
		}

		console.log("✔ Availability checklist saved");
		deferred.resolve(true);
	});

	return deferred.promise;
}


function dataElementAvailabilityTable(dataElems, metaData) {
	var content = "<table width=\"100%\"><col width=\"15%\"><col width=\"70%\"><col width=\"15%\" align=\"center\">" +
					"<tr><th>Code</th><th >Name</th><th>Available</th></tr>";	
	for (var de of dataElems) {
		var cats = categories(de, metaData);

		var rows = 2;
		for (var c of cats) {
			var opts = options(c, metaData);
			rows++;
			for (var opt of opts) {
				rows++;
			}
		}

		content += "<tr><td rowspan=" + (rows > 2 ? rows : 1) + ">" + (de.code ? de.code : "N/A") + 
			"</td><td align=\"left\">" + de.name + "</td><td align=\"center\">▢</td></tr>";
	
		for (var c of cats) {
			var opts = options(c, metaData);
			content += "<tr><td><p style=\"margin: 0px; margin-left: 24px;\"><em>" + 
					c.name + "</em></p></td><td align=\"center\">▢</td></tr>";
			for (var opt of opts) {
				content += "<tr><td><p style=\"margin: 0px; margin-left: 48px;\"><em>" + 
					opt.name + "</em></p></td><td align=\"center\">▢</td></tr>";
			}
		}
		if (cats.length > 0) {
			content += "<tr><td><p style=\"margin: 0px; margin-left: 24px; margin-bottom: 48px\"><em>" + 
					"Other disaggregations, specify:</em></p></td><td align=\"center\">▢</td></tr>";
		}
	}

	content += "</table>";
	return content;
}


function indicatorAvailabilityTable(metaData) {
	var content = "<table width=\"100%\"><col width=\"15%\"><col width=\"70%\"><col width=\"15%\">" +
				"<tr><th>Code</th><th >Name</th><th>Available</th></tr>";

	for (var ind of metaData.indicators) {
		content += "<tr><td rowspan=3>" + (ind.code ? ind.code : "N/A") + 
			"</td><td align=\"left\">" + ind.name + "</td><td align=\"center\">▢</td></tr>";
		content += "<tr><td><p style=\"margin: 0px; margin-left: 24px;\">Numerator: " 
				+ ind.numeratorDescription + "</td><td align=\"center\">▢</td></tr>";
		content += "<tr><td><p style=\"margin: 0px; margin-left: 24px;\">Denominator: " 
				+ ind.denominatorDescription + "</td><td align=\"center\">▢</td></tr>";
	}
	
	content += "</table>";
	
	return content;

}

function options(category, metaData) {
	
	if (category.id == "GLevLNI9wkl") return [];
	
	var opts = [];
	for (var catCo of category.categoryOptions) {
		for (var co of metaData.categoryOptions) {
			if (catCo.id == co.id) opts.push(co);
		}
	}
	return opts;
}


function categories(dataElement, metaData) {
	
	
	//combo => catIds => cats
	var comboId = dataElement.categoryCombo.id;
	if (comboId == "bjDvmb4bfuf") return [];
	
	var ctg = [];
	for (var cc of metaData.categoryCombos) {
		if (cc.id === comboId) {
			for (var cat of cc.categories) {
				for (var ct of metaData.categories) {
					if (cat.id == ct.id) ctg.push(ct);	
				}
			}
		}
	}
	
	return ctg;
}

function dataElements(dataSet, metaData) {
	var des = [];
	for (var de of metaData.dataElements) {
		for (var dsde of dataSet.dataSetElements) {
			if (dsde.dataElement.id == de.id) des.push(de);
		}
	}
	
	return des;
}

function dataElement(id, metaData) {
	for (var de of metaData.dataElements) {
		if (id == de.id) return de;
	}
	
	return false;
}


function sections(parent, metaData) {
	var ses = [];
	if (metaData.hasOwnProperty("sections")) {
		for (var se of metaData.sections) {
			if (se.dataSet.id == parent.id) ses.push(se);		
		}
	}

	if (metaData.hasOwnProperty("programStageSections")) {
		for (var se of metaData.programStageSections) {
			if (se.programStage.id == parent.id) ses.push(se);		
		}
	}
	
	//Sort by sort order
	ses = utils.arraySortByProperty(ses, "sortOrder", true, true);
	return ses;
}


function standaloneDataElements(metaData) {
	var des = [];
	for (var de of metaData.dataElements) {
		var grouped = false;
		
		for (var ds of metaData.dataSets) {
			for (var dsde of ds.dataSetElements) {
				if (de.id == dsde.dataElement.id) grouped = true;
			}
		}
		
		if (!grouped) des.push(de);
	}
	
	return des;
}


function dataSetSectionElement(dataSet, metaData) {

	var deIndex = {};
	for (var dse of dataSet.dataSetElements) {
		deIndex[dse.dataElement.id] = true;
	}

	var allSections = sections(dataSet, metaData);	
	var structure = [];
	
	for (var sec of allSections) {
		for (var de of sec.dataElements) {
			structure.push({
				"section": sec.name, 
				"dataElement": dataElement(de.id, metaData).name
			});
			delete deIndex[de.id];
		}
	}
	
	for (var de in deIndex) {
		structure.push({
			"section": "None", 
			"dataElement": dataElement(de, metaData).name
		});
	}
	
	return structure;
}


function programSectionFromStageAndElement(stageId, dataElementId, metaData) {
	for (var pss of metaData.programStageSections) {
		if (pss.programStage.id == stageId) {
			for (var de of pss.dataElements) {
				if (de.id == dataElementId) {
					return pss.name;
				}
			}			
		}
	}
	return "";
}


function programProgramRules(programId, metaData) {
	var programRules = [];
	for (var pr of metaData.programRules) {
		if (pr.program.id == programId) programRules.push(pr);
	}
	return programRules;
}


function getName(id, metaData) {
	for (var type in metaData) {
		if (utils.isArray(metaData[type])) {
			for (var item of metaData[type]) {
				if (item.hasOwnProperty("id") && item.hasOwnProperty("name") && item.id == id) {
					return item.name;
				}
			}
		}
	}
	return id;
}

function getObject(id, metaData) {
	for (var type in metaData) {
		if (utils.isArray(metaData[type])) {
			for (var item of metaData[type]) {
				if (item.hasOwnProperty("id") && item.id == id) {
					return item;
				}
			}
		}
	}
	return false;
}
