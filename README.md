# Metadata dependency export
Node.js backend to export DHIS 2 metadata packages, along with documentation.

Three types of packages can be created:

* *dashboards* - includes analytical products (dashboards) with dependencies only, such as dashboards, favourites, indicators (with empty formulas).
* *aggregate* - includes data collection (data sets) and analytical products (dashboards) with dependencies, such as data sets, data elements, dashboards, favourites, indicators etc.
* *tracker* - includes tracker data collection (programs) with dependencies, as well as analytical products.

See the Configuration section below for more information on what is/can be included in the different pacakges.

## Setup
Requires npm and node.js. 

Install dependencies:

```
$ npm install
```

## Usage
Packages are defined through .json configuration files, which are described below. Run the script like this:

```
$ node export.js ./example_configuration.json
```

You will be prompted for a username and password for each DHIS2 instance you are exporting metadata from.


Running the script creates a folder with several files, in the following format:
`CODE_PACKAGE-TYPE_PACKAGE-VERSION_DHIS2-VERSION`, e.g. `HIV_DASHBOARD_V1.0_DHIS2.27`

Within this folder, there will be 3 or 4 files depending on the package type:

* metadata.json - DHIS2 metadata
* reference.md - human readable listing of included metadata in markdown format
* availability.md - tool that can be used for checking which data elements/indicators from the package are available in a DHIS2 instance
* configuration.md - [dashboard packages only] tool to facilitate configuration of dashboard packages, listing indicators etc which needs to be configured


### Configuration
The export script relies on a configuration file in .json format. The configuration file consists of an array of json objects that define what should be included in a particular package. Certain properties are common to all types of packages (complete aggregate, dashboard aggregate and tracker), others only for some.

**Properties related to the package**


| Property        | Description           | Example  |
| ------------- |:-------------| -----|
| _basePath     | Path to a folder in which the packages will be saved |
| _code     | Code for the package. Used for package identifier, sub-folder name etc. |
| _customFuncs     | Javascript code that will be executed after metadata export is finished, but before the metadata is saved. Allows necessary modifications of the metadata if needed. |
| _name     | Name of the package, used for logs and debugging  |
| _ownership  | Specifies how to manage ownership of metadata in the package (i.e. association with a DHIS2 user). Described in more detail below. |
| _sharing | Specifies how to manage sharing of metadata in the package (i.e. association with a DHIS2 user). Described in more detail below. |
| _type     | Type of metadata package. "completeAggregate", "dashboardAggregate", or "tracker" |
| _url     | List with URL of one or more DHIS2 instances to export the package from.  |
| _version     | Version number of the package. Used for package identifier, sub-folder name etc. |
| _prefix     | (dashboardAggregate only) Prefix that will be added to indicators and category option groups that require configuration. |


**Properties for specifying metadata to include in the package**

| Property        | Description           | Example  |
| ------------- |:-------------| -----|
| customObjects     | Specifies arbitrary metadata objects to include in the package, independent of any dependencies they may have. |
| dashboardIds | List with UIDs of dashboards that will be included in the package, with their dependences (favourites and indicators) |
| dataElementGroupIds | List with UIDs of data element groups that will be included in the package. Data elements in the groups are not included, and reference to any data element that is not part of the package will be removed. |
| dataSetIds | List with UIDs of dashboards that will be included in the package, with their dependencies. Uses DHIS2's built in metadata dependency export. |
| exportDataSetIds | List with UIDs of data sets for which dependencies will be included in the package, *but not the data set itself*. |
| exportIndicatorGroupsIds | List with UIDs of indicator groups for which indicators will be included in the package, *but not the group itself* |
| indicatorGroupIds | List with UIDs of indicator groups that will be included in the package. Indicators in the groups are not included, and reference to any data element that is not part of the package will be removed. |
| validationRuleGroupIds | List with UIDs of validation rule groups to include in the package, including validation rules in those groups. |


**Ownership**

The *ownership* property allows modification of the "user" (owner) and "lastUpdatedBy" properties of metadata in the package.
```
{
  "modeOwner": "OVERWRITE",
  "modeLastUpdated": "REMOVE",
  "ownerId": "vUeLeQMSwhN"
}
```
`modeOwner/modeLastUpdated` can be one of the following:

* "IGNORE" - leave as-is.
* "REMOVE" - remove.
* "OVERWRITE" - set user/lasteUpdatedBy of all metadata to ownerId specified.

The user specified is included in the export.

**Sharing**

The *sharing* property allows modification of the sharing settings of metadata in the package. This included public sharing (`publicAccess`), sharing with groups (`userGroupAccesses`) and sharing with individual users (`userAccesses`).@

```
{
  "groupMode": "MERGE",
  "groups": [
    {
      "id": "pyu2ZlNKbzQ",
      "metadata": "VIEW",
      "data": "VIEW"
	},
	{
      "id": "Ubzlyfqm1gO",
	  "metadata": "EDIT",
	  "data": "VIEW"
	}
  ],
  "groupExport": true,
  "userMode": "REMOVE",
  "users": [],
  "usersExport": false,
  "publicAccess": {
    "metadata": "VIEW",
    "data": "VIEW"
  }
}
```

`groupMode/userMode`, `groups/users` and `groupExport/userExport` are equivalent, except referring to sharing with user groups and individual users.

`groupMode/userMode` can be one of the following:

* "IGNORE" - leave sharing as-is.
* "REMOVE" - remove sharing information.
* "FILTER" - remove sharing with any groups/users not specified in the configuration.
* "MERGE": - combine existing sharing settings with any groups/users specified in the configuration. If access rights are different, those in the configuration are used. Existing groups are not automatically included in the export.
* "OVERWRITE" - set sharing to that specified in the configuration file.

`groups/users` is an array of objects, where each object refers to a user group/user. It should include the ID, and (except for IGNORE, REMOVE, and FILTER) the metadata and data access to give to the group. Options for metadata and data access are "NONE", "VIEW" and "EDIT". Data access is only applied to relevant objects according to the DHIS2 schema. If a group/user has no metadata OR data access to an object, it is not included.

`groupExport/userExport` is used to indicate whether or not the user groups and users should themselves be included in the package.

`publicAccess` is an object with "metadata" and "data" properties, where the options are "NONE", "VIEW" and "EDIT".


#### Example configuration with comments
``` js
{
  "export": [						//array of configurations, each is one package
    {
      "_basePath": "../TB", 		//path to a folder in which the packages will be saved
      "_code": "TB", 
       "_customFuncs": [			//function applied to the metadata after the export has been completed. Received "metaData" object as paramter
		"var dashItems = []; for (var i = 0; i < metaData.dashboards.length; i++) { if (metaData.dashboards[i].id == 'u0ZDGUlrxz8') { dashItems = metaData.dashboards[i].dashboardItems; metaData.dashboards.splice(i, 1); break; } } if (metaData.hasOwnProperty('dashboardItems')) { for (var item of dashItems) { for (var i = 0; i < metaData.dashboardItems.length; i++) { if (metaData.dashboardItems[i].id == item.id) { metaData.dashboardItems.splice(i, 1); break; } } } }"
        ],
      "_name": "TB dashboard", 
      "_prefix": "[CONFIG]", 
      "_ownership": {				//allows modification of the user set as owner of metadata objects
        "mode": "OVERWRITE",
        "ownerId": "vUeLeQMSwhN"
      },
      "_sharing": {					//allows modification of sharing settings
        "groupMode": "OVERWRITE",
        "groups": [
          {
            "id": "pyu2ZlNKbzQ",
            "metadata": "VIEW",
            "data": "VIEW"
          },
          {
            "id": "Ubzlyfqm1gO",
            "metadata": "EDIT",
            "data": "VIEW"
          }
        ],
        "groupExport": true,		
        "userMode": "REMOVE",
        "users": [],
        "userExport": false,
        "publicAccess": {
          "metadata": "VIEW",
          "data": "VIEW"
        }
      },
      "_type": "dashboardAggregate", //type of package
      "_url": [
        "https://who.dhis2.org/demo" //servers to export 
      ], 
      "_version": "1.2.0", 
      "customObjects": [			//custom objects to include. These do cause validation to fail.
        {
          "objectIds": ["BuTAAbV4zMg"],
          "objectType": "reports"
        }
      ],
      "dashboardIds": [
        "w48LnY9Gamc", 
        "BwYHhBSvLNL", 
        "VtRtBqorLfR", 
        "if78tRW7B91", 
        "MaJqTSteIqg", 
        "pZXvrpebwFT", 
        "dp6xqlPGxbA", 
        "xJXvUOEhnE9", 
        "CKcF4jgN0hK", 
        "L2UmLVcb6Dm",
        "u0ZDGUlrxz8"
      ], 
      "exportIndicatorGroupsIds": [], 
      "indicatorGroupIds": [
        "V4SoC7TzFMi", 
        "OMyYjoU07pC", 
        "QCrsjqhAcWA", 
        "S0n1torLnUz", 
        "I13HBLJTJMb"
      ]
    }, 
    {								//start of second package to export
      "_basePath": "../TB", 
      "_code": "TB",
      "_customFuncs": [
		"var dashItems = []; for (var i = 0; i < metaData.dashboards.length; i++) { if (metaData.dashboards[i].id == 'u0ZDGUlrxz8') { dashItems = metaData.dashboards[i].dashboardItems; metaData.dashboards.splice(i, 1); break; } } if (metaData.hasOwnProperty('dashboardItems')) { for (var item of dashItems) { for (var i = 0; i < metaData.dashboardItems.length; i++) { if (metaData.dashboardItems[i].id == item.id) { metaData.dashboardItems.splice(i, 1); break; } } } }"
        ],
      "_name": "TB complete", 
      "_ownership": {
        "mode": "OVERWRITE",
        "ownerId": "vUeLeQMSwhN"
      },
      "_sharing": {
        "groupMode": "MERGE",
        "groups": [
          {
            "id": "pyu2ZlNKbzQ",
            "metadata": "VIEW",
            "data": "VIEW"
          },
          {
            "id": "Ubzlyfqm1gO",
            "metadata": "EDIT",
            "data": "VIEW"
          },
          {
            "id": "UKWx4jJcrKt",
            "metadata": "NONE",
            "data": "EDIT"
          }
        ],
        "groupExport": true,
        "userMode": "REMOVE",
        "users": [],
        "usersExport": false,
        "publicAccess": {
          "metadata": "VIEW",
          "data": "VIEW"
        }
      }, 
      "_type": "completeAggregate", 
      "_url": [
        "https://who.dhis2.org/demo"
      ], 
      "_version": "1.2.0", 
      "customObjects": [
        {
          "objectIds": ["DkmMEcubiPv"], 
          "objectType": "dataElements"
        },
        {
          "objectIds": ["dQxhOVtwwK8", "StXxQoaz26k"], 
          "objectType": "reportTables"
        },
        {
          "objectIds": ["BuTAAbV4zMg"],
          "objectType": "reports"
        }
      ],
      "dashboardIds": [
        "w48LnY9Gamc", 
        "BwYHhBSvLNL", 
        "VtRtBqorLfR", 
        "if78tRW7B91", 
        "MaJqTSteIqg", 
        "pZXvrpebwFT", 
        "dp6xqlPGxbA", 
        "xJXvUOEhnE9", 
        "CKcF4jgN0hK", 
        "L2UmLVcb6Dm",
        "u0ZDGUlrxz8"
      ], 
      "dataElementGroupIds": [
        "VGJHJGsfdRR", 
        "aGtzAAao0Mt", 
        "m54T3OptLaU", 
        "fAS1m0weZsf", 
        "V4Ctf7L4wq6", 
        "gDwHOp9bAdJ"
      ], 
      "dataSetIds": [
        "OyutuMOPgkt", 
        "lYNYevNTO7B", 
        "Yhk4Ee59d9y", 
        "VQTEps77HLq", 
        "Fn5XKDV6WRY", 
        "rSfhnkAdm5y", 
        "kiODgwGG9I2"
      ], 
      "exportDataSetIds": [], 
      "exportIndicatorGroupsIds": [
        "S0n1torLnUz"
      ], 
      "indicatorGroupIds": [
        "V4SoC7TzFMi", 
        "OMyYjoU07pC", 
        "QCrsjqhAcWA", 
        "S0n1torLnUz", 
        "I13HBLJTJMb"
      ], 
      "validationRuleGroupIds": [
        "iRCrvkyr4uw", 
        "sgf2zdOiwny", 
        "dRcxM3sLcNn", 
        "TumuGy1lmGY", 
        "vtIZawvyEM7", 
        "xnxqh8hX6Ag"
      ]
    }
  ]
}
``` 


## Misc
`d2metapack` bash script is included as example of how to add the export script 
to your PATH, so that it can be run like `d2metapack ./hivConfig.json` (where `./hivConfig.json` is a configuration file as described above).


## To-do
* Testing of multi-stage tracker metadata packages
* Improve naming of properties in the configuration

