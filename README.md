# Metadata dependency export
Node.js backend to export DHIS 2 metadata with dependencies

## Setup
Requires npm and node.js. 

Install dependencies:

```
$ npm install
```

Run script/backend:

```
$ node export.js
```


## Usage


### Configuration


### Output
The file for each export will be save in a folder with the following format:
`PREFIX_TYPE_PACKAGE-VERSION_DHIS2-VERSION`, e.g. `HIV_DASHBOARD_V1.0_DHIS2.27`


## Misc
`d2metapack` bash script is included as example of how to add the export script 
to your PATH, so that it can be run like `d2metapath hivConfig.json` (where `hivConfig.json` is a configuration file as described above).


## To-do








