# MongoDB addons

`npm install mongodb-addons`

## JOIN & MERGE

```js

// cursor.join('relationship-property', 'where-to-bind', 'collection-name', [fields], [additional-filter])
// relationship-property -> is compared with ._id and values must be ObjectId()
// cursor.merge(function(err, rows) {})

db.collection('products').find().join('idcategory', 'category', 'categories-collection').merge(function(err, docs) {
    console.log(docs);
});

// or

db.collection('products').find().join('idcategory', 'category', 'categories', { name: 1 }).merge(function(err, docs) {
    console.log(docs);
});

db.collection('products').find().join('idcategory', 'category', 'categories', { name: 1 }, { removed: false }).merge(function(err, docs) {
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

## MongoBuilder

A helper class for building filters.

### Quering

```javascript
var builder = new MongoBuilder();
// var builder = new MongoBuilder(skip, take);

builder.between('age', 20, 30);
builder.or().where('firstname', '=', 'Peter').where('firstname', '=', 'Jozef').end();
builder.where('_id', '=', '0000', true); // true === AUTOCONVERT string to ObjectID
builder.sort('age', false); // true == ascending, false == descending

// builder.like(name, value);
// builder.regex(name, value);
// builder.and()...filter...end();
// builder.in(name, value);
// builder.nin(name, value);
// builder.filter(name, value); --> is same as builder.where()

builder.take(10);

// Execute
// Uses filter, pagination + sorting and returns cursor
builder.find(COLLECTION).toArray(function(err, docs) {
    console.log(docs);
});

// Execute
// Uses filter
builder.findOne(COLLECTION, function(err, doc) {
    console.log(doc);
});
```

### Updating

```javascript
var builder = new MongoBuilder();

// Filter
builder.where('age', '>', 10);

// Update
builder.set('firstname', 'Peter');
builder.set({ lastname: 'Peter' });
builder.inc('countview', 1);

// Execute
builder.update(COLLECTION, { multi: true }, function(err, result) {
    console.log(result);
});
```

### Deleting

```javascript
var builder = new MongoBuilder();

// Filter
builder.where('age', '>', 10);

// Execute
builder.remove(COLLECTION, function(err, result) {
    console.log(result);
});
```

### Bonus

```javascript
var builder = new MongoBuilder();

// Filter
builder.where('age', '>', 10);

// Serialize builder to JSON
var json = builder.save();
builder.load(json);
```
