#!/usr/bin/env node
require('dotenv').config();
const converter = require('openapi-to-postmanv2')
const collection = require('./lib/collection')
process.env.SUPPRESS_NO_CONFIG_WARNING = 'y';
var configModule = require('config')
config = configModule.util.loadFileConfigs(__dirname + '/config/')
const fetch = require('./lib/fetch')
const merger=require('./lib/merger')
const fs = require('fs');

const program = require('commander')
program.version('1.0.0')
    .option('-s --service <service>', 'which service to convert')
    .option('-r --replace [repliaces]', 'comma split api name which will replace not merge')
    .parse(process.argv)


var serviceConfig = config[program.service]
var url = serviceConfig.url
var collectionName = serviceConfig.collection_name

//run update
update().catch(err => {
    console.error("run failed," + err)
})

//get swagger json
function getSwaggerJsonHttp(url) {
    console.log("downloading swagger json from: ", url);
    return fetch({
        url: url,
        methods: 'get'
    }).then(response => {
        return response.data
    }).catch(err => {
        console.log('get swagger json failed: ' + err.message)
        process.exit(-1);
    })
}

// get swagger json from file
function getSwaggerJson(path) {
    console.log("reading swagger json from file: ", path);
    return new Promise((resolve, reject) => {
        fs.readFile(path, 'utf8', (err, data) => {
            if (err) {
                reject(err)
            }
            resolve(JSON.parse(data))
        })
    }).catch(err => {
        console.log('get swagger json failed: ' + err.message)
        process.exit(-1);
    })
}

async function backup(collectionName, collectionData) {
    const fileName = `${new Date().getTime()}.json`;
    const backupDir = `./backup/${collectionName}/`;
    console.log("backup collection to file: ", backupDir + fileName);

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }
    fs.writeFileSync(backupDir + fileName, JSON.stringify(collectionData, null, 2));
}

async function update() {

    if (url.match(/^https?:\/\//)) {
        var swaggerJson = await getSwaggerJsonHttp(url)
    } else {
        var swaggerJson = await getSwaggerJson(url)
    }
    //add postman collection used info
    swaggerJson['info'] = {
        'title': collectionName,
        'description': collectionName + ' api',
        'version': '1.0.0',
        '_postman_id': '807bb824-b333-4b59-a6ef-a8d46d3b95bf'
    }
    var converterInputData = {
        'type': 'json',
        'data': swaggerJson
    }

    //use postman tool convert to postman collection
    converter.convert(converterInputData, { 'folderStrategy': 'Tags' }, async (_a, res) => {
        if (res.result === false) {
            console.log('convert failed')
            console.log(res.reason)
            return
        }
        var convertedJson = res.output[0].data

        var id = await collection.getCollectionId(collectionName)
        if (id === null) {
            return
        }
        var collectionJson = {
            'collection': {
                'info': {
                    'name': collectionName,
                    'description': collectionName + ' api',
                    '_postman_id': id,
                    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"

                },
                "item": convertedJson.item
            }
        }
    
        var savedCollection = await collection.getCollectionDetail(id)   
        await backup(collectionName, savedCollection)
        var mergedCollection=merger.merge(savedCollection,collectionJson)    
        collection.updateCollection(id, mergedCollection)
    })
}