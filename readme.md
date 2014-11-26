# MongoDB addons

`npm install mongodb-addons`

## JOIN & MERGE

```js

// cursor.join('relationship-property', 'where-to-bind', 'collection-name')
// relationship-property -> is compared with ._id and values must be ObjectId()
// cursor.merge(function(err, rows) {})

db.collection('products').find().join('idcategory', 'category', 'categories-collection').merge(function(err, docs) {
    console.log(docs);
});
```

## GridStore
- is a global variable

## ObjectID
- is a global variable

## ObjectID.parse(value)
- a simple static function to parse ObjectID from some value

## ObjectID.parseArray(value)
- a simple static function to parse Array of ObjectID from string array or from string (delimiter ",")
