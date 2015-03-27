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

```javascript
GridStore.writeFile(DB, new ObjectID(), '/path/file.txt', 'file.txt', { 'ME':1 }, function(err) {
    // CALLBACK IS OPTIONAL
});
```

```javascript
GridStore.readFile(DB, 'object-id', function(fs, close) {
    var writer = fs.createWriteStream('/path/file.txt');
    fs.stream(true).on('close', close).pipe(writer);
});
```

## ObjectID
- is a global variable

## ObjectID.parse(value)
- a simple static function to parse ObjectID from some value

## ObjectID.parseArray(value)
- a simple static function to parse Array of ObjectID from string array or from string (delimiter ",")

## MongoBuilder

A helper class for building filters and __it's a global variable__.

### Quering

```javascript
var builder = new MongoBuilder();
// var builder = new MongoBuilder(skip, take);

builder.between('age', 20, 30);
builder.or().where('firstname', '=', 'Peter').where('firstname', '=', 'Jozef').end();
builder.where('_id', '=', '0000', true); // true === AUTOCONVERT string to ObjectID
builder.where('isremoved', false); // default operator is "="
builder.sort('age', false); // true == ascending, false == descending

// builder.between(name, min, max);
// builder.like(name, value);
// builder.regex(name, value);
// builder.or()...filter...end();
// builder.and()...filter...end();
// builder.in(name, value);
// builder.nin(name, value);
// builder.where(name, operator, value);
// builder.filter(name, operator, value); --> is same as builder.where()
// builder.clear();
// builder.clearFilter([skip, take]);
// builder.clearSort();
// builder.clearAggregate();
// builder.clearSet();
// builder.clearInc();
// builder.take(number);
// builder.limit(number); --> is same as builder.take()
// builder.skip(number);
// builder.sort(name, [asc]);
// builder.page(page, max);

builder.page(3, 50); // Sets the page 3 with 50 items (max) on the page

// Execute
// Uses filter, pagination + sorting and returns cursor
builder.find(COLLECTION).toArray(function(err, docs) {
    console.log(docs);
});

// Execute
// Uses filter, pagination + sorting + count() + requery collection
builder.findArrayCount(COLLECTION, function(err, docs, count) {
    console.log(docs, count);
});

// Uses filter, pagination + sorting
builder.findArray(COLLECTION, function(err, docs) {
    console.log(docs);
});

// Execute
// Uses filter
builder.findOne(COLLECTION, function(err, doc) {
    console.log(doc);
});
```

### Updating

- `_id` property is skipped automatically

```javascript
var builder = new MongoBuilder();

// Filter
builder.where('age', '>', 10);

// Update
builder.set('firstname', 'Peter');
builder.set({ firstname: 'Peter', lastname: 'Širka' });
builder.inc('countview', 1);

// Updates only age field
// _id is skipped automatically
builder.set({ _id: ObjectID('..'), firstname: 'Peter' lastname: 'Širka', age: 30 }, ['age']);

// Skips the age field
// _id is skipped automatically
builder.set({ _id: ObjectID('..'), firstname: 'Peter' lastname: 'Širka', age: 30 }, ['age'], true);

// Execute
builder.update(COLLECTION, function(err, result) {
    console.log(result);
});

// Execute
builder.updateOne(COLLECTION, function(err, result) {
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

builder.removeOne(COLLECTION, function(err, result) {
    console.log(result);
});
```

### Aggregation

__$match__:

```javascript
var builder = new MongoBuilder();

builder.where('_id', '=', new ObjectID());
// { $match: { _id: 54d916f34c46f862576336a3 }}
```

__$skip and $limit__:

```javascript
builder.skip(10);
// { $skip: 10 }

builder.take(10);
// { $limit: 10 }
```

__$sort__:

```javascript
var builder = new MongoBuilder();

builder.sort('age', false);
// { $sort: { age: -1 }}
```

__$group__:

```javascript
builder.group('_id.year.year', 'count.$sum.1');
builder.group('_id.month.month');
// { $group: { _id: { year: '$year', month: '$month' }, count: { $sum: 1 }}}

builder.group('_id.', 'count.$avg.quantity');
// { $group: { _id: null, count: { $avg: '$quantity' }}}

builder.group('_id.item', 'count.$push.item');
builder.group('_id.item', 'count.$push.quantity');
// { $group: { _id: 'item', count: { $push: ['$item', '$quantity'] }}}
```

__$unwind__:

```javascript
builder.unwind('sizes');
// { $unwind: '$sizes' }}
```

__$project__:

```javascript
builder.project('title.1');
builder.project('author.1');
// { $project: { 'title': 1, 'author': 1 }}
```

__execute aggregation__:

```javascript
// builder.aggregate(collection, [options], callback);
builder.aggregate(COLLECTION, function(err, results) {
    console.log(results);
});
```

### Serialization / Deserialization

```javascript
var builder = new MongoBuilder();

// Filter
builder.where('age', '>', 10);

// Serialize builder to JSON
var json = builder.save();
builder.load(json);
```

### Cloning & Merging

```javascript
var builder = new MongoBuilder();

// Filter
builder.where('age', '>', 10);

// Cloning
var newbuilder = builder.clone();
var newbuilderOnlyFilterAndSort = builder.clone(true);

newbuilder.where('firstname', 'Peter');

builder.merge(newbuilder);
// builder.merge(builder, [rewrite], [onlyFilter]);
```
