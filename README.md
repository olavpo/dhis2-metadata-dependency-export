# Metadata dependency export
Node.js backend to export DHIS 2 metadata packages, along with documentation.

Two types of packages can be created:

* *dashboards* - includes analytical products only, such as dashboards, favourites, indicators (with empty formulas) etc.
* *aggregate* - includes data collection and analytical products, such as data sets, data elements, dashboards, favourites, indicators etc.

Export of tracker packages will be added in the future.

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
The export script relies on a configuration file in .json format. The configuration file has one part with common information about the package(s) being exported (under `"general"`), and one part where the specific content to be included in the package(s) and the server to fetch data from is specified.

```
{ 
  "general": {
    "basePath": "/Users/Olav/Downloads",    //Path to where folder(s) with metadata and documentation will be stored
    "prefix": "[CONFIG]",                   //Prefix for indicators etc that needs post-import configuration. Relevant for dashboard packages only.
    "code": "TB",                           //Code for the package(s), used for naming the export folder and creating a package identifier
    "version": "1.0",                       //Version of the package(s)
    "sharing": {                            //Sharing setting that will be applied to all metadata in the export, overwriting existing sharing
      "accessGroupIds": ["pyu2ZlNKbzQ"],    //User groups with metadata and data view access. Groups will be included in the export.
      "adminGroupIds": ["Ubzlyfqm1gO"],     //User groups with metadata edit and data view access. Groups will be included in the export.
      "publicAccess": "--------",           //Public access
      "userId": "vUeLeQMSwhN"               //User which will be set as owner of all metadata. User will be included in the export.
    }
  },
  "export": [                               //Array specifying the metadata packages to export
    {                                       //Example of "dashboard" package
      "url": [                              //Array of URLs of the server to export from. Multiple are allowed so that the same metadata can be exported from instances running different DHIS2 versions.
        "https://who.dhis2.net/dev", 
        "https://who.dhis2.net/demo"
      ],
      "name": "TB dashboard",               //Name of the package, used in documentation, logging etc
      "type": "dashboardAggregate",         //Type of export. Current options are "dashboardAggregate" or "completeAggregate"
      "dashboardIds": [                     //IDs of dashboards to export, including dependencies, i.e. favourites and indicators used in those favourites
        "w48LnY9Gamc", 
        ...
      ], 
      "indicatorGroupIds": [                //IDs of indicator groups to export. Indicator in the groups are NOT included unless they are also in e.g. dashboards.
        "V4SoC7TzFMi", 
        ...
      ],
      "exportIndicatorGroupsIds": [         //IDs of indicator groups for which indicators will be exported (as opposed to the above)
          "F6Sofd7TgMi",
          ...
      ]
    }, 
    {                                       //Example of "dashboard" package
      "url": [                              //Array of URLs of the server to export from. Multiple are allowed so that the same metadata can be exported from instances running different DHIS2 versions.
        "https://who.dhis2.net/dev", 
        "https://who.dhis2.net/demo"
      ],
      "name": "TB complete",                //As above
      "type": "completeAggregate",          //As above
      "dashboardIds": [                     //As above
        "w48LnY9Gamc", 
        ...
      ], 
      "dataElementGroupIds": [              //IDs of data element groups to export. Data elements in the groups are NOT included unless they are also in e.g. dashboards.
        "VGJHJGsfdRR", 
        ...
      ], 
      "dataSetIds": [                       //IDs of data sets to export, including dependencies, i.e. data elements, data element cateogries etc.
        "OyutuMOPgkt", 
        ...
      ], 
      "exportDataSetIds": [                 //IDs of data sets for which only the dependencies will be exported, not the data sets themselves.
        "gUUBxTWcEUi"
      ], 
      "indicatorGroupIds": [                //As above
        "V4SoC7TzFMi", 
        ...
      ], 
      "exportIndicatorGroupsIds": [         //As above
        "S0n1torLnUz"
      ], 
      "validationRuleGroupIds": [           //Validation rule groups to export, with dependencies, i.e. validation rules.
        "iRCrvkyr4uw", 
        ...
      ]
    }
  ]
}
``` 


## Misc
`d2metapack` bash script is included as example of how to add the export script 
to your PATH, so that it can be run like `d2metapath hivConfig.json` (where `hivConfig.json` is a configuration file as described above).


## To-do








