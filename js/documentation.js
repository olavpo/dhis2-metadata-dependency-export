/*jshint esversion: 6 */
"use strict";

var fs = require("fs");
var Q = require("q");
var utils = require("./utils.js");
var pretty = require("pretty");

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

	var toc = [], tab = [];

	var content = utils.htmlHead("Metadata reference");
	content += utils.htmlHeader("Metadata reference", 1);
	content += "TOCPLACEHOLDER";

	content += utils.htmlHeader("Package info", 2);
	var parts = metaData.package.split("_");
	tab.push(["Property", "Value"]);
	tab.push(["Code", parts[0]]);
	tab.push(["Type", parts[1]]);
	tab.push(["Version", parts[2]]);
	tab.push(["DHIS2 version", parts[3]]);
	tab.push(["Created", parts[4]]);
	tab.push(["Identifier", metaData.package]);
	content += utils.htmlTableFromArrayVertical(tab);

	referenced["package"] = true;
	toc.push({"id": "package", "name": "Package ID"});




	//tracked entity types
	if (metaData.trackedEntityTypes && metaData.trackedEntityTypes.length > 0) {
		referenced["trackedEntityTypes"] = true;
		toc.push({"id": "trackedEntityTypes", "name": "Tracked Entity Types"});
		content += utils.htmlHeader("Tracked entity types", 2, "trackedEntityTypes");
		tab = [["Name", "Last updated","UID"]];

		var tet;
		for (var i = 0; i < metaData.trackedEntityTypes.length; i++) {
			tet = metaData.trackedEntityTypes[i];
			tab.push([tet.name, tet.lastUpdated.substr(0,10), tet.id]);
		}
		content += utils.htmlTableFromArray(tab, true);


		//tracked entity type attributes
		content += utils.htmlHeader("Tracked Entity Type - Tracked Entity Type Attributes", 3);
		tab = [["Tracked Entity Type", "Tracked Entity Type Attribute"]];
		for (var i = 0; i < metaData.trackedEntityTypes.length; i++) {
			tet = metaData.trackedEntityTypes[i];
			for (var tea of tet.trackedEntityTypeAttributes) {
				tab.push([tet.name, getName(tea.id, metaData)]);
			}
		}
		content += utils.htmlTableFromArray(tab, true);
	}


	//tracked entity attributes
	if (metaData.trackedEntityAttributes && metaData.trackedEntityAttributes.length > 0) {
		referenced["trackedEntityAttributes"] = true;
		toc.push({"id": "trackedEntityAttributes", "name": "Tracked Entity Attributes"});
		content += utils.htmlHeader("Tracked entity attributes", 2, "trackedEntityAttributes");
		tab = [["Name","Code","Description","Last updated","UID"]];

		var tea;
		for (var tea of metaData.trackedEntityAttributes) {
			tab.push([tea.name, (tea.code ? tea.code : ""), tea.description, tea.lastUpdated.substr(0,10), tea.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}


	//dataset: sections, custom form bool, data elements, uid
	if (metaData.dataSets && metaData.dataSets.length > 0) {
		referenced["dataSets"] = true;
		referenced["sections"] = true;
		referenced["dataEntryForms"] = true;
		toc.push({"id": "dataSets", "name": "Data Sets"});

		var ds, sec, de;
		content += utils.htmlHeader("Data sets", 2, "dataSets");
		for (var i = 0; i < metaData.dataSets.length; i++) {
			ds = metaData.dataSets[i];

			var dsSec = sections(ds, metaData);

			content += utils.htmlHeader(ds.name, 3);
			tab = [["Property", "Value"]];
			tab.push(["Name:", "" + ds.name]);
			tab.push(["Custom form:", ds.dataEntryForm ? ds.dataEntryForm.id : "No"]);
			tab.push(["Sections:", (dsSec.length > 0 ? "Yes" : "No")]);
			tab.push(["Last updated", ds.lastUpdated.substr(0,10)]);
			tab.push(["UID:", ds.id]);
			content += utils.htmlTableFromArrayVertical(tab);

			if (dsSec.length > 0) {
				content += utils.htmlHeader("Sections", 4);
				tab = [["Section", "Last updated", "UID"]];

				for (var sec of sections(ds, metaData)) {
					tab.push([sec.name, sec.lastUpdated.substr(0,10), sec.id]);
				}
				content += utils.htmlTableFromArray(tab, true);


				content += utils.htmlHeader("Data Set Section - Data Element", 4);
				tab = [["Data Set Section", "Data Element"]];

				var dataSetSectionElementList = dataSetSectionElement(ds, metaData);
				for (var row of dataSetSectionElementList) {
					tab.push([row.section, row.dataElement]);
				}
				content += utils.htmlTableFromArray(tab, true);
			}
			else {
				content += utils.htmlHeader("Data Elements", 4);
				tab = [["Data Elements"]];

				var dataSetSectionElementList = dataSetSectionElement(ds, metaData);
				for (var row of dataSetSectionElementList) {
					tab.push([row.dataelement]);
				}
				content += utils.htmlTableFromArray(tab, true);
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
		toc.push({"id": "programs", "name": "Programs"});
		toc.push({"id": "programRules", "name": "Program Rules"});

		content += utils.htmlHeader("Programs", 2, "programs");
		for (var h = 0; h < metaData.programs.length; h++) {
			var prog = metaData.programs[h];
			content += utils.htmlHeader(prog.name, 3);
			tab = [["Property", "Value"]];

			tab.push(["Name", prog.name]);
			if (prog.programType != "WITHOUT_REGISTRATION") tab.push(["Tracked Entity Type:", getName(prog.trackedEntityType.id, metaData)]);
			tab.push(["Last updated:", prog.lastUpdated.substr(0,10)]);
			tab.push(["UID:", prog.id]);
			content += utils.htmlTableFromArrayVertical(tab);



			var ps, sec;
			content += utils.htmlHeader("Program Stages", 4);
			tab = [["Program Stage", "Last updated", "UID"]];

			for (var i = 0; i < prog.programStages.length; i++) {
				ps = metaData.programStages[i];
				for (var j = 0; j < metaData.programStages.length && !ps; j++) {
					if (prog.programStages[i].id == metaData.programStages[j].id) ps = metaData.programStages[j];
				}
				tab.push([ps.name, ps.lastUpdated.substr(0,10), ps.id]);
			}
			content += utils.htmlTableFromArray(tab, true);

			content += utils.htmlHeader("Program Stage - Program Stage Section - Data Element", 4);
			tab = [["Program Stage", "Program Stage Section", "Data Element"]];

			for (var ps of prog.programStages) {
				ps = getObject(ps.id, metaData);
				for (var psde of ps.programStageDataElements) {
					tab.push([ps.name, programSectionFromStageAndElement(ps.id, psde.dataElement.id, metaData), getName(psde.dataElement.id, metaData)]);
				}
			}
			content += utils.htmlTableFromArray(tab, true);

			//Program indicators
			if (metaData.programIndicators && metaData.programIndicators.length > 0) {
				referenced["programIndicators"] = true;
				toc.push({"id": "programIndicators", "name": "Program Indicators"});

				content += utils.htmlHeader("Program Indicators", 2, "programIndicators");
				tab = [["Name", "Shortname", "Code", "Description", "Analytics Type", "Last updated", "UID"]];

				var ind, type;
				for (var i = 0; i < metaData.programIndicators.length; i++) {
					ind = metaData.programIndicators[i];

					tab.push([ind.name, ind.shortName, (ind.code ? ind.code : ""), (ind.description ? ind.description : " "),
					ind.analyticsType, (ind.lastUpdated ? ind.lastUpdated.substr(0,10) : ""), ind.id]);
				}
				content += utils.htmlTableFromArray(tab, true);
			}


			//Program rules
			var programRules = programProgramRules(prog.id, metaData);
			content += utils.htmlHeader("Program Rules", 4, "programRules");
			tab = [["Program rule", "Description", "Last updated", "UID"]];

			for (var pr of programRules) {
				tab.push([pr.name, pr.description, pr.lastUpdated.substr(0,10), pr.id]);
			}
			content += utils.htmlTableFromArray(tab, true);


			//Program tracked entity attributes
			content += utils.htmlHeader("Program Tracked Entity Attributes", 4);
			tab = [["Tracked Entity Attribute Name", "Last updated", "Program Tracked Entity Attribute UID", "Tracked Entity Attribute UID"]];
			for (var ptea of prog.programTrackedEntityAttributes) {
				ptea = getObject(ptea.id, metaData);
				tab.push([getName(ptea.trackedEntityAttribute.id, metaData), ptea.lastUpdated.substr(0,10), ptea.id, ptea.trackedEntityAttribute.id]);
			}
			content += utils.htmlTableFromArray(tab, true);
		}
	}

	//constants
	if (metaData.constants && metaData.constants.length > 0) {
		referenced["constants"] = true;
		toc.push({ "id": "constants", "name": "Constants" });

		content += utils.htmlHeader("Constants", 2, "constants");
		tab = [["Name", "Shortname", "Last updated", "UID"]];

		for (let i = 0; i < metaData.constants.length; i++) {
			let constant = metaData.constants[i];
			tab.push([constant.name, constant.shortName, constant.lastUpdated.substr(0, 10), constant.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//data elements: name, shortname, description, categorycombo, uid
	if (metaData.dataElements && metaData.dataElements.length > 0) {
		referenced["dataElements"] = true;
		toc.push({"id": "dataElements", "name": "Data Elements"});

		content += utils.htmlHeader("Data Elements", 2, "dataElements");
		tab = [["Name", "Shortname", "Code", "Description", "Categorycombo", "Last updated", "UID"]];

		for (var i = 0; i < metaData.dataElements.length; i++) {
			de = metaData.dataElements[i];
			var comboName = getName(de.categoryCombo.id, metaData);
			tab.push([de.name, de.shortName, (de.code ? de.code : ""), (de.description ? de.description : ""), comboName, de.lastUpdated.substr(0,10), de.id]);
		}
		content += utils.htmlTableFromArray(tab, true);

	}

	//data element groups
	if (metaData.dataElementGroups && metaData.dataElementGroups.length > 0) {
		referenced["dataElementGroups"] = true;
		toc.push({"id": "dataElementGroups", "name": "Data Element Groups"});

		content += utils.htmlHeader("Data Element Groups", 2);
		tab = [["Name", "Shortname", "Last updated", "UID"]];

		for (var item of metaData.dataElementGroups) {
			tab.push([item.name, (item.shortName ? item.shortName : ""), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);

		content += utils.htmlHeader("Data Element Groups - Data Elements", 3);
		tab = [["Data Element Group", "Data Element"]];

		var item, elements;
		for (var item of metaData.dataElementGroups) {
			for (var de of item.dataElements) {
				tab.push([item.name, getName(de.id, metaData)]);
			}
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//categorycombos
	if (metaData.categoryCombos && metaData.categoryCombos.length > 0) {
		referenced["categoryCombos"] = true;
		toc.push({"id": "categoryCombos", "name": "Category Combos"});

		content += utils.htmlHeader("Category Combinations", 2, "categoryCombos");
		tab = [["Name", "Last updated", "UID", "Categories"]];

		var cc, dec, elements;
		for (var i = 0; i < metaData.categoryCombos.length; i++) {
			cc = metaData.categoryCombos[i];
			elements = [];

			for (var j = 0; j < cc.categories.length; j++) {
				for (var k = 0; k < metaData.categories.length; k++) {
					if (cc.categories[j].id == metaData.categories[k].id) elements.push(metaData.categories[k].name);
				}
			}

			tab.push([cc.name, cc.lastUpdated.substr(0,10), cc.id, (elements.length > 0 ? elements.join("; ") : " ")]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//categories
	if (metaData.categories && metaData.categories.length > 0) {
		referenced["categories"] = true;
		toc.push({"id": "categories", "name": "Categories"});

		content += utils.htmlHeader("Data Element Categories", 2, "categories");
		tab = [["Name", "Last updated", "UID", "Category options"]];

		var dec, co, elements;
		for (var i = 0; i < metaData.categories.length; i++) {
			dec = metaData.categories[i];
			elements = [];

			for (var j = 0; j < dec.categoryOptions.length; j++) {
				for (var k = 0; k < metaData.categoryOptions.length; k++) {
					if (dec.categoryOptions[j].id == metaData.categoryOptions[k].id) elements.push(metaData.categoryOptions[k].name);
				}
			}

			tab.push([dec.name, dec.lastUpdated.substr(0,10), dec.id, (elements.length > 0 ? elements.join("; ") : " ")]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//category options
	if (metaData.categoryOptions && metaData.categoryOptions.length > 0) {
		referenced["categoryOptions"] = true;
		toc.push({"id": "categoryOptions", "name": "Category Options"});

		content += utils.htmlHeader("Data Element Category Options", 2, "categoryOptions");
		tab = [["Name", "Last updated", "UID"]];

		var co;
		for (var i = 0; i < metaData.categoryOptions.length; i++) {
			co = metaData.categoryOptions[i];
			tab.push([co.name, co.lastUpdated.substr(0,10), co.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//categoryOptionCombos
	if (metaData.categoryOptionCombos && metaData.categoryOptionCombos.length > 0) {
		referenced["categoryOptionCombos"] = true;
		toc.push({"id": "categoryOptionCombos", "name": "Category Option Combos"});

		content += utils.htmlHeader("Category Option Combination", 2, "categoryOptionCombos");
		tab = [["Name", "Last updated", "UID"]];

		var coc;
		for (var i = 0; i < metaData.categoryOptionCombos.length; i++) {
			coc = metaData.categoryOptionCombos[i];
			tab.push([coc.name, coc.lastUpdated.substr(0,10), coc.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//categoryOptionGroupSets
	if (metaData.categoryOptionGroupSets && metaData.categoryOptionGroupSets.length > 0) {
		referenced["categoryOptionGroupSets"] = true;
		toc.push({"id": "categoryOptionGroupSets", "name": "Category Option Group Sets"});

		content += utils.htmlHeader("Category Option Group Sets", 2, "categoryOptionGroupSets");
		tab = [["Name", "Last updated", "UID"]];

		var cogs;
		for (var i = 0; i < metaData.categoryOptionGroupSets.length; i++) {
			cogs = metaData.categoryOptionGroupSets[i];
			tab.push([cogs.name, cogs.lastUpdated.substr(0,10), cogs.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//categoryOptionGroups
	if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
		referenced["categoryOptionGroups"] = true;
		toc.push({"id": "categoryOptionGroups", "name": "Category Option Groups"});

		content += utils.htmlHeader("Category Option Groups", 2, "categoryOptionGroups");
		tab = [["Name", "Shortname", "Last updated", "UID"]];

		for (var j = 0; metaData.categoryOptionGroups && j < metaData.categoryOptionGroups.length; j++) {
			item = metaData.categoryOptionGroups[j];
			tab.push([item.name, item.shortName, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);

		content += utils.htmlHeader("Category Option Group Sets - Category Option Groups", 3);
		tab = [["Category Option Group Sets", "Category Option Groups"]];

		var item, cog;
		for (var j = 0; metaData.categoryOptionGroupSets && j < metaData.categoryOptionGroupSets.length; j++) {
			item = metaData.categoryOptionGroupSets[j];
			for (var k = 0; k < item.categoryOptionGroups.length; k++) {
				cog = item.categoryOptionGroups[k];
				for (var l = 0; l < metaData.categoryOptionGroups.length; l++) {
					if (cog.id === metaData.categoryOptionGroups[l].id) {
						tab.push([item.name, metaData.categoryOptionGroups[l].name]);
					}
				}
			}
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//optionSets
	if (metaData.optionSets && metaData.optionSets.length > 0) {
		referenced["optionSets"] = true;
		toc.push({"id": "optionSets", "name": "Option Sets"});

		content += utils.htmlHeader("Option Sets", 2, "optionSets");
		tab = [["Name", "Last updated", "UID", "Options"]];

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
				elements.splice(20);
				elements.push("another " + notShown + " options not shown.");
			}

			elementText = elements.join("; ");
			tab.push([os.name, os.lastUpdated.substr(0,10), os.id, elementText]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//options
	if (metaData.options && metaData.options.length > 0) {
		referenced["options"] = true;
		toc.push({"id": "options", "name": "Options"});

		content += utils.htmlHeader("Options", 2, "options");
		content += "<table><tr><th>Name</th><th>Code</th><th>Last updated</th><th>UID</th></tr>";
		var opt;
		for (var i = 0; i < metaData.options.length; i++) {
			opt = metaData.options[i];
			content += "<tr><td>" + getName(opt.optionSet.id, metaData) + "</td><td>" + opt.name + "</td><td>" + opt.code + "</td><td>" + opt.lastUpdated.substr(0,10) + "</td><td>" + opt.id + "</td></tr>";
		}
		content += "</table>";
	}

	//validation rules
	if (metaData.validationRules && metaData.validationRules.length > 0) {
		referenced["validationRules"] = true;
		toc.push({"id": "validationRules", "name": "Validation Rules"});

		content += utils.htmlHeader("Validation Rules", 2, "validationRules");
		tab = [["Name", "Instruction", "Left side", "Operator", "Right side", "Last updated", "UID"]];

		for (var i = 0; i < metaData.validationRules.length; i++) {
			var vr = metaData.validationRules[i];

			tab.push([vr.name, vr.instruction, vr.leftSide.description, vr.operator, vr.rightSide.description, vr.lastUpdated.substr(0,10), vr.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//validation rule groups
	if (metaData.validationRuleGroups && metaData.validationRuleGroups.length > 0) {
		referenced["validationRuleGroups"] = true;
		toc.push({"id": "validationRuleGroups", "name": "Validation Rule Groups"});

		content += utils.htmlHeader("Validation Rule Groups", 2, "validationRuleGroups");
		tab = [["Name", "Last updated", "UID"]];

		for (var j = 0; metaData.validationRuleGroups && j < metaData.validationRuleGroups.length; j++) {
			item = metaData.validationRuleGroups[j];
			tab.push([item.name, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);

		content += utils.htmlHeader("Validation Rule Groups - Validation Rules", 3);
		tab = [["Validation Rule Group", "Validation Rule"]];

		var item, elements;
		for (var j = 0; metaData.validationRuleGroups && j < metaData.validationRuleGroups.length; j++) {
			item = metaData.validationRuleGroups[j];
			for (var k = 0; k < item.validationRules.length; k++) {
				de = item.validationRules[k];
				for (var l = 0; l < metaData.validationRules.length; l++) {
					if (de.id === metaData.validationRules[l].id) {
						tab.push([item.name, metaData.validationRules[l].name]);
					}
				}
			}
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//predictors
	if (metaData.predictors && metaData.predictors.length > 0) {
		referenced["predictors"] = true;
		toc.push({"id": "predictors", "name": "Predictors"});

		content += utils.htmlHeader("Predictors", 2, "predictors");
		tab = [["Name", "Generator", "Sequential samples", "Annual samples", "Target data element", "Last updated", "UID"]];

		var pred;
		for (var i = 0; i < metaData.predictors.length; i++) {
			pred = metaData.predictors[i];

			var targetName = "";
			for (var j = 0; metaData.dataElements && j < metaData.dataElements.length; j++) {
				if (metaData.dataElements[j].id === pred.output.id) targetName = metaData.dataElements[j].name;
			}
			tab.push([pred.name, pred.generator.description, pred.sequentialSampleCount, pred.annualSampleCount, targetName,
			pred.lastUpdated.substr(0,10), pred.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}



	//indicators: name, shortname, description, numeratorDescription, denominatorDescription, type, uid
	if (metaData.indicators && metaData.indicators.length > 0) {
		referenced["indicators"] = true;
		toc.push({"id": "indicators", "name": "Indicators"});

		content += utils.htmlHeader("Indicators", 2, "indicators");
		tab = [["Name", "Shortname", "Code", "Description", "Numerator", "Denominator", "Type", "Last updated", "UID "]];

		var ind, type;
		for (var i = 0; i < metaData.indicators.length; i++) {
			ind = metaData.indicators[i];

			for (var j = 0; j < metaData.indicatorTypes.length; j++) {
				if (ind.indicatorType.id == metaData.indicatorTypes[j].id) {
					type = metaData.indicatorTypes[j].name;
					break;
				}
			}

			tab.push([ind.name, ind.shortName, (ind.code ? ind.code : ""), (ind.description ? ind.description : ""),
			ind.numeratorDescription, ind.denominatorDescription, type, (ind.lastUpdated ? ind.lastUpdated.substr(0,10) : ""), ind.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//indicator groups
	if (metaData.indicatorGroups && metaData.indicatorGroups.length > 0) {
		referenced["indicatorGroups"] = true;
		toc.push({"id": "indicatorGroups", "name": "Indicator Groups"});

		content += utils.htmlHeader("Indicator Groups", 2, "indicatorGroups");
		tab = [["Name", "Shortname", "Last updated", "UID"]];

		for (var j = 0; metaData.indicatorGroups && j < metaData.indicatorGroups.length; j++) {
			item = metaData.indicatorGroups[j];
			tab.push([item.name, (item.shortName ? item.shortName : ""), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);


		content += utils.htmlHeader("Indicator Groups - Indicators", 3);
		tab = [["Indicator Group", "Indicator"]];

		var item, elements;
		for (var j = 0; metaData.indicatorGroups && j < metaData.indicatorGroups.length; j++) {
			item = metaData.indicatorGroups[j];
			for (var k = 0; k < item.indicators.length; k++) {
				de = item.indicators[k];
				for (var l = 0; l < metaData.indicators.length; l++) {
					if (de.id === metaData.indicators[l].id) {
						tab.push([item.name, metaData.indicators[l].name]);
					}
				}
			}
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//indicatorTypes
	if (metaData.indicatorTypes && metaData.indicatorTypes.length > 0) {
		referenced["indicatorTypes"] = true;
		toc.push({"id": "indicatorTypes", "name": "Indicator Types"});

		content += utils.htmlHeader("Indicator types", 2, "indicatorTypes");
		tab = [["Name", "Factor", "Last updated", "UID"]];

		var it;
		for (var i = 0; i < metaData.indicatorTypes.length; i++) {
			it = metaData.indicatorTypes[i];
			tab.push([it.name, it.factor, (it.lastUpdated ? it.lastUpdated.substr(0,10) : ""), it.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//programIndicator groups
	if (metaData.programIndicatorGroups && metaData.programIndicatorGroups.length > 0) {
		referenced["programIndicatorGroups"] = true;
		toc.push({ "id": "programIndicatorGroups", "name": "Program Indicator Groups" });

		content += utils.htmlHeader("Program Indicator Groups", 2, "programIndicatorGroups");
		tab = [["Name", "Shortname", "Last updated", "UID"]];

		for (var j = 0; metaData.programIndicatorGroups && j < metaData.programIndicatorGroups.length; j++) {
			item = metaData.programIndicatorGroups[j];
			tab.push([item.name, (item.shortName ? item.shortName : ""), item.lastUpdated.substr(0, 10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);


		content += utils.htmlHeader("Program Indicator Groups - Program Indicators", 3);
		tab = [["Program Indicator Group", "Program Indicator"]];

		var pI;
		for (var j = 0; metaData.programIndicatorGroups && j < metaData.programIndicatorGroups.length; j++) {
			item = metaData.programIndicatorGroups[j];
			for (var k = 0; k < item.programIndicators.length; k++) {
				pI = item.programIndicators[k];
				for (var l = 0; l < metaData.programIndicators.length; l++) {
					if (pI.id === metaData.programIndicators[l].id) {
						tab.push([item.name, metaData.programIndicators[l].name]);
					}
				}
			}
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//dashboards and dashboard items
	if (metaData.dashboards && metaData.dashboards.length > 0) {
		referenced["dashboards"] = true;
		referenced["dashboardItems"] = true;
		toc.push({"id": "dashboards", "name": "Dashboards"});

		var db, dbi;
		content += utils.htmlHeader("Dashboards", 2, "dashboards");
		for (var i = 0; i < metaData.dashboards.length; i++) {
			db = metaData.dashboards[i];

			content += utils.htmlHeader(db.name, 3);
			tab = [["Property", "Value"]];
			tab.push(["Name:", db.name]);
			tab.push(["Last updated:", db.lastUpdated.substr(0,10)]);
			tab.push(["UID:", db.id]);
			content += utils.htmlTableFromArrayVertical(tab);


			content += utils.htmlHeader("Dashboard items", 4);
			tab = [["Content/item type", "Content name", "Content UID", "Last updated", "Dashboard Item UID"]];

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
				tab.push([type, name, id, dbi.lastUpdated.substr(0,10), dbi.id]);
			}
			content += utils.htmlTableFromArray(tab, true);
		}
	}

	//charts
	if (metaData.charts && metaData.charts.length > 0) {
		referenced["charts"] = true;
		toc.push({"id": "charts", "name": "Charts"});

		content += utils.htmlHeader("Charts", 2, "charts");
		tab = [["Name", "Description", "Last updated", "UID"]];

		for (var i = 0; i < metaData.charts.length; i++) {
			var item = metaData.charts[i];
			tab.push([item.name, (item.description ? item.description : " "), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//pivottables
	if (metaData.reportTables && metaData.reportTables.length > 0) {
		referenced["reportTables"] = true;
		toc.push({"id": "reportTables", "name": "Report Tables"});

		content += utils.htmlHeader("Report tables", 2, "reportTables");
		tab = [["Name", "Description", "Last updated", "UID"]];

		for (var i = 0; i < metaData.reportTables.length; i++) {
			var item = metaData.reportTables[i];
			tab.push([item.name, (item.description ? item.description : " "), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//maps and map view
	if (metaData.maps && metaData.maps.length > 0) {
		referenced["maps"] = true;
		referenced["mapViews"] = true;
		toc.push({"id": "maps", "name": "Maps"});

		content += utils.htmlHeader("Maps", 2, "maps");
		tab = [["Name", "Description", "Last updated", "UID"]];

		for (var i = 0; i < metaData.maps.length; i++) {
			var item = metaData.maps[i];
			tab.push([item.name, (item.description ? item.description : " "), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);

		//mapviews
		if (metaData.mapViews && metaData.mapViews.length > 0) {
			content += utils.htmlHeader("Map views", 3);
			tab = [["Parent map name", "Parent map UID", "Last updated", "UID"]];

			for (var k = 0; k < metaData.mapViews.length; k++) {
				var mv = metaData.mapViews[k];
				for (var i = 0; i < metaData.maps.length; i++) {
					var item = metaData.maps[i];
					for (var j = 0; j < item.mapViews.length; j++) {
						if (mv.id === item.mapViews[j].id) {
							tab.push([item.name, item.id, mv.lastUpdated.substr(0,10), mv.id]);
						}
					}
				}
			}
			content += utils.htmlTableFromArray(tab, true);
		}
	}

	//eventReports
	if (metaData.eventReports && metaData.eventReports.length > 0) {
		referenced["eventReports"] = true;
		toc.push({"id": "eventReports", "name": "Event Reports"});

		content += utils.htmlHeader("Event reports", 2, "eventReports");
		tab = [["Name", "Description", "Last updated", "UID"]];

		for (var i = 0; i < metaData.eventReports.length; i++) {
			var item = metaData.eventReports[i];
			tab.push([item.name, (item.description ? item.description : " "), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}


	//eventCharts
	if (metaData.eventCharts && metaData.eventCharts.length > 0) {
		referenced["eventCharts"] = true;
		toc.push({"id": "eventCharts", "name": "Event Charts"});

		content += utils.htmlHeader("Event charts", 2, "eventCharts");
		tab = [["Name", "Description", "Last updated", "UID"]];

		for (var i = 0; i < metaData.eventCharts.length; i++) {
			var item = metaData.eventCharts[i];
			tab.push([item.name, (item.description ? item.description : " "), item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}


	//reports
	if (metaData.reports && metaData.reports.length > 0) {
		referenced["reports"] = true;
		toc.push({"id": "reports", "name": "Standard Reports"});

		content += utils.htmlHeader("Standard reports", 2, "reports");
		tab = [["Name", "Last updated", "UID"]];

		for (var i = 0; i < metaData.reports.length; i++) {
			var item = metaData.reports[i];
			tab.push([item.name, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//resources
	if (metaData.documents && metaData.documents.length > 0) {
		referenced["documents"] = true;
		toc.push({"id": "documents", "name": "Resources"});

		content += utils.htmlHeader("Resources", 2, "resources");
		tab = [["Name", "Last updated", "UID"]];

		for (var i = 0; i < metaData.documents.length; i++) {
			var item = metaData.documents[i];
			tab.push([item.name, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//sqlViews
	if (metaData.sqlViews && metaData.sqlViews.length > 0) {
		referenced["sqlViews"] = true;
		toc.push({"id": "sqlViews", "name": "SQL views"});

		content += utils.htmlHeader("SQL views", 2, "sqlViews");
		tab = [["Name", "Last updated", "UID"]];

		for (var i = 0; i < metaData.sqlViews.length; i++) {
			var item = metaData.sqlViews[i];
			tab.push([item.name, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//legend sets and legends
	if (metaData.legendSets && metaData.legendSets.length > 0) {
		referenced["legendSets"] = true;
		toc.push({"id": "legendSets", "name": "Legend Sets"});

		content += utils.htmlHeader("Legend Sets", 2, "legendSets");

		var legendSet;
		for (var i = 0; i < metaData.legendSets.length; i++) {
			legendSet = metaData.legendSets[i];

			content += utils.htmlHeader(legendSet.name, 3);
			tab = [["Property", "Value"]];

			tab.push(["Name:", legendSet.name]);
			tab.push(["Last updated:", legendSet.lastUpdated.substr(0,10)]);
			tab.push(["UID", legendSet.id]);
			content += utils.htmlTableFromArrayVertical(tab);

			content += utils.htmlHeader("Legends", 4);
			tab = [["Name", "Start", "End", "Last updated", "UID "]];

			for (var j = 0; j < legendSet.legends.length; j++) {
				var item = legendSet.legends[j];
				tab.push([item.name, item.startValue, item.endValue, item.lastUpdated, item.id]);
			}
			content += utils.htmlTableFromArray(tab, true);
		}
	}

	//tracked entity instance filters
	if (metaData.trackedEntityInstanceFilters && metaData.trackedEntityInstanceFilters.length > 0) {
		referenced["trackedEntityInstanceFilters"] = true;
		toc.push({ "id": "trackedEntityInstanceFilters", "name": "Tracked Entity Instance Filters"});

		content += utils.htmlHeader("Tracked Entity Instance Filters", 2, "trackedEntityInstanceFilters");
		tab = [[ "Name", "Last updated", "UID"]];

		for (let i = 0; i < metaData.trackedEntityInstanceFilters.length; i++) {
			let teif = metaData.trackedEntityInstanceFilters[i];
			tab.push([teif.name, teif.lastUpdated.substr(0, 10), teif.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//user groups
	if (metaData.userGroups && metaData.userGroups.length > 0) {
		referenced["userGroups"] = true;
		toc.push({"id": "userGroups", "name": "User Groups"});

		content += utils.htmlHeader("User Groups", 2, "userGroups");
		tab = [["Name", "Last updated", "UID"]];

		for (var i = 0; i < metaData.userGroups.length; i++) {
			var item = metaData.userGroups[i];
			tab.push([item.name, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//users
	if (metaData.users && metaData.users.length > 0) {
		referenced["users"] = true;

		content += utils.htmlHeader("Users", 2);
		tab = [["Username", "Last updated", "UID"]];

		for (var i = 0; i < metaData.users.length; i++) {
			var item = metaData.users[i];
			tab.push([item.userCredentials.username, item.lastUpdated.substr(0,10), item.id]);
		}
		content += utils.htmlTableFromArray(tab, true);
	}

	//Check if there are any objects missing. No point aborting, as .json is
	//already written - but show warning 
	for (var object in referenced) {
		if (!referenced[object]) {
			console.log("Warning: Not included in reference file: " + object);
		}
	}


	var tocContent = "<div id=\"tocContainer\"><ul>";
	for (var obj of toc) {
		tocContent += "<li><a href=\"#" + obj.id + "\">" + obj.name + "</a></li>";
	}
	tocContent += "</ul></div>";
	content = content.replace("TOCPLACEHOLDER", tocContent);

	content += utils.htmlTail();
	content = pretty(content);

	fs.writeFile(basePath + "/reference.html", content, function(err) {
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

	var content = utils.htmlHead("Configuration checklist");
	content += utils.htmlHeader("Configuration checklist", 1);

	var tableData;
	//indicators
	if (metaData.indicators && metaData.indicators.length > 0) {
		tableData = [];
		tableData.push(["Name", "Configured"]);

		var ind;
		for (var i = 0; i < metaData.indicators.length; i++) {
			ind = metaData.indicators[i];

			tableData.push([ind.name, "▢"]);
		}

		utils.htmlHeader("Indicators", 2);
		content += utils.htmlTableFromArray(tableData, true, [85, 15], ["left", "center"]);
	}

	//category option group sets
	if (metaData.categoryOptionGroups && metaData.categoryOptionGroups.length > 0) {
		tableData = [];
		tableData.push(["Name", "Configured"]);

		var cog;
		for (var i = 0; i < metaData.categoryOptionGroups.length; i++) {
			cog = metaData.categoryOptionGroups[i];

			tableData.push([cog.name, "▢"]);
		}

		utils.htmlHeader("Category Option Groups, 2");
		content += utils.htmlTableFromArray(tableData, true, [85, 15], ["left", "center"]);
	}

	content += utils.htmlTail();
	content = pretty(content);

	fs.writeFile(basePath + "/configuration.html", content, function(err) {
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

	var content = utils.htmlHead("Availability mapping");
	content += utils.htmlHeader("Availability mapping", 1);

	//data elements
	if (metaData.dataSets && metaData.dataElements && metaData.dataElements.length > 0) {
		content += utils.htmlHeader("Data elements", 2);

		for (var ds of metaData.dataSets) {
			content += utils.htmlHeader(ds.name, 3);
			content += dataElementAvailabilityTable(dataElements(ds, metaData), metaData);
		}

		var unGrouped = standaloneDataElements(metaData);
		if (unGrouped.length > 0) {
			content += utils.htmlHeader("Other", 3);
			content += dataElementAvailabilityTable(unGrouped, metaData);
		}
	}


	//indicators
	if (metaData.indicators && metaData.indicators.length > 0) {
		content += utils.htmlHeader("Indicators", 2);
		content += indicatorAvailabilityTable(metaData);
	}

	content += utils.htmlTail();
	content = pretty(content);

	fs.writeFile(basePath + "/availability.html", content, function(err) {
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

	//In CUSTOM-type exports, we might have data elements without categorycombos
	if (!metaData.categoryCombos || metaData.categoryCombos.length == 0) return ctg;

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
	for (var pss of metaData.programStageSections) {
		if(!pss.programStage) {
			return null;
		}
		else if (pss.programStage.id == stageId) {
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
