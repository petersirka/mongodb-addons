var Cursor = require('mongodb').Cursor;
var Util = require('util');
var O = require('mongodb').BSONPure.ObjectID;
var NUMBER = 'number';
var STRING = 'string';
var BOOLEAN = 'boolean';

global.ObjectID = require('mongodb').ObjectID;
global.GridStore = require('mongodb').GridStore;

Cursor.prototype.join = function(source, target, collection, fields, filter) {

    var self = this;

    if (!self.pop)
        self.pop = [];

    var cache = {};
    var item = { relation: [], source: source, target: target, collection: collection, fields: fields === undefined ? null : fields, filter: filter };

    self.each(function(err, doc) {
        if (doc === null)
            return;
        var value = doc[item.source];
        if (value !== null && value !== undefined) {
            if (value instanceof Array) {
                for (var i = 0, length = value.length; i < length; i++) {
                    if (cache[value[i]])
                        continue;
                    cache[value[i]] = true;
                    item.relation.push(value[i]);
                }
            }
            else {
                if (!cache[value]) {
                    cache[value] = true;
                    item.relation.push(value);
                }
            }
        }
    });

    self.pop.push(item);
    return self;
};

Cursor.prototype.merge = function(db, callback) {

    var self = this;

    self.toArray(function(err, rows) {

        if (err) {
            callback(err, null);
            return;
        }

        var sets = rows.slice(0);

        var done = function() {
            for (var a = 0, al = sets.length; a < al; a++) {
                var row = sets[a];
                for (var b = 0, bl = self.pop.length; b < bl; b++) {
                    var pop = self.pop[b];
                    var source = row[pop.source];
                    var length = source && source instanceof Array ? source.length || 0 : 0;

                    if (length > 0)
                        row[pop.target] = [];

                    for (var c = 0, cl = pop.result.length; c < cl; c++) {
                        var join = pop.result[c];
                        if (length === 0) {
                            if (join._id.equals(source)) {
                                sets[a][pop.target] = join;
                                break;
                            }
                        } else {
                            for (var d = 0; d < length; d++) {
                                if (join._id.equals(source[d]))
                                    sets[a][pop.target].push(join);
                            }
                        }
                    }
                }
            }
            callback(null, sets);
        };

        self.pop.wait(function(item, next) {

            var filter = item.filter ? Util._extend({}, item.filter) : {};
            var length = item.relation.length;
            if (length <= 1)
                filter._id = length === 1 ? item.relation[0] : null;
            else
                filter._id = { '$in': item.relation };

            db.collection(item.collection).find(filter, item.fields).limit(length).toArray(function(err, docs) {
                item.result = docs;
                next();
            });

        }, done);

    });

    return self;
};

ObjectID.parse = function(value, isArray) {
    if (value instanceof ObjectID)
        return value;
    if (isArray || value instanceof Array)
        return ObjectID.parseArray(value);
    if (O.isValid(value))
        return new ObjectID(value);
    return null;
};

ObjectID.parseArray = function(value) {

    if (typeof(value) === STRING)
        value = value.split(',');

    var arr = [];

    if (!(value instanceof Array))
        return arr;

    for (var i = 0, length = value.length; i < length; i++) {
        var id = ObjectID.parse(value[i]);
        if (id)
            arr.push(id);
    }

    return arr;
};

if (!Array.prototype.wait) {
    Array.prototype.wait = function(onItem, callback, remove) {

        var self = this;
        var type = typeof(callback);

        if (type === NUMBER || type === BOOLEAN) {
            var tmp = remove;
            remove = callback;
            callback = tmp;
        }

        if (remove === undefined)
            remove = 0;

        var item = remove === true ? self.shift() : self[remove];

        if (item === undefined) {
            if (callback)
                callback();
            return self;
        }

        onItem.call(self, item, function() {
            setImmediate(function() {
                if (typeof(remove) === NUMBER)
                    remove++;
                self.wait(onItem, callback, remove);
            });
        });

        return self;
    };
}

function MongoBuilder(skip, take) {
    skip = this.parseInt(skip);
    take = this.parseInt(take);
    this.builder = {};
    this._sort = null;
    this._skip = skip >= 0 ? skip : 0;
    this._take = take >= 0 ? take : 0;
    this._scope = 0;
    this._inc = {};
    this._set = {};
}

MongoBuilder.prototype.skip = function(value) {
    var self = this;
    if (value === undefined)
        return self._skip;
    value = self.parseInt(value);
    self._skip = value;
    return self;
};

MongoBuilder.prototype.take = function(value) {
    var self = this;
    if (value === undefined)
        return self._take;
    value = self.parseInt(value);
    self._take = value;
    return self;
};

MongoBuilder.prototype.page = function(value, max) {
    var self = this;
    value = self.parseInt(value) - 1;
    max = self.parseInt(max);
    if (value < 0)
        value = 0;
    self._skip = value * max;
    self._take = max;
    return self;
};

MongoBuilder.prototype.limit = function(value) {
    var self = this;
    if (value === undefined)
        return self._take;
    value = self.parseInt(value);
    self._take = value;
    return self;
};

MongoBuilder.prototype.first = function() {
    var self = this;
    self._skip = 0;
    self._take = 1;
    return self;
};

MongoBuilder.prototype.sort = function(name, asc) {
    var self = this;
    if (asc === undefined)
        asc = true;
    if (self._sort === null)
        self._sort = {};
    self._sort[name] = asc === true || asc === 'asc' || asc === 1 ? 1 : -1;
    return self;
};

MongoBuilder.prototype.scope = function(name, obj) {
    var self = this;

    console.log(name, obj);

    if (self._scope === 0) {
        self.builder[name] = obj;
        return self;
    }

    if (self._scope === 1) {
        if (!self.builder['$or'])
            self.builder['$or'] = [];
        var filter = {};
        filter[name] = obj;
        self.builder['$or'].push(filter);
    }

    if (self._scope === 1) {
        if (!self.builder['$and'])
            self.builder['$and'] = [];
        var filter = {};
        filter[name] = obj;
        self.builder['$and'].push(filter);
    }

    return self;
};

MongoBuilder.prototype.in = function(name, value) {
    return this.scope(name, { '$in': value });
};

MongoBuilder.prototype.nin = function(name, value) {
    return this.scope(name, { '$nin': value });
};

MongoBuilder.prototype.or = function() {
    var self = this;
    if (self._scope)
        return self.end();
    self._scope = 1;
    return self;
};

MongoBuilder.prototype.and = function() {
    var self = this;
    if (self._scope)
        return self.end();
    self._scope = 2;
    return self;
};

MongoBuilder.prototype.set = function(name, model) {
    var self = this;

    if (self._set === null)
        self._set = {};

    if (typeof(name) === 'string') {
        self._set[name] = model;
        return self;
    }

    Util._extend(self._set, model);
    return self;
};

MongoBuilder.prototype.clear = function(skip, take) {
    var self = this;
    skip = self.parseInt(skip);
    take = self.parseInt(take);
    self.builder = {};
    self._sort = null;
    self._skip = skip >= 0 ? skip : 0;
    self._take = take >= 0 ? take : 0;
    self._scope = 0;
    self._inc = {};
    self._set = {};
    return self;
};

MongoBuilder.prototype.parseInt = function(num) {
    if (typeof(num) === NUMBER)
        return num;
    if (!num)
        return 0;
    num = parseInt(num);
    if (isNaN(num))
        num = 0;
    return num;
};

MongoBuilder.prototype.inc = function(name, model) {
    var self = this;

    if (self._inc === null)
        self._inc = {};

    if (typeof(name) === 'string') {
        self._inc[name] = model;
        return self;
    }

    Util._extend(self._inc, model);
    return self;
};

/**
 * End scope
 * @return {MongoBuilder}
 */
MongoBuilder.prototype.end = function() {
    var self = this;
    self._scope = 0;
    return self;
};

MongoBuilder.prototype.between = function(name, valueA, valueB) {
    var a, b;
    if (valueA > valueB) {
        a = valueB;
        b = valueA;
    } else {
        a = valueA;
        b = valueB;
    }
    return this.scope(name, { '$lte': a, '$gte': b });
};

MongoBuilder.prototype.like = function(name, value) {
    return this.scope(name, { '$regex': value });
};

MongoBuilder.prototype.regex = function(name, value) {
    return this.scope(name, { '$regex': value });
};

MongoBuilder.prototype.where = function(name, operator, value, isID) {
    return this.filter(name, operator, value, isID);
};

MongoBuilder.prototype.filter = function(name, operator, value, isID) {

    if (value === undefined) {
        value = operator;
        operator = '=';
    }

    var self = this;

    if (isID)
        value = ObjectID.parse(value);

    switch (operator) {
        case '=':
            return self.scope(name, value);
        case '!=':
        case '<>':
            return self.scope(name, { '$ne': value });
        case '>':
            return self.scope(name, { '$gt': value });
        case '>=':
            return self.scope(name, { '$gte': value });
        case '<':
            return self.scope(name, { '$lt': value });
        case '<=':
            return self.scope(name, { '$lte': value });
    }
    return self;
};

MongoBuilder.prototype.save = function() {
    var self = this;
    return JSON.stringify({ filter: self.builder, take: self._take, skip: self._skip, inc: self._inc, set: self._set });
};

MongoBuilder.prototype.load = function(value) {

    if (typeof(value) === 'string')
        value = JSON.parse(value);

    var self = this;

    self.filter = value.builder;
    self._take = self.parseInt(value.take);
    self._skip = self.parseInt(value.skip);
    self._set = value.set;
    self._inc = value.inc;

    if (typeof(self.filter) !== 'object' || self.filter === null || self.filter === undefined)
        self.filter = {};

    if (typeof(self._set) !== 'object' || self._set === undefined)
        self._set = null;

    if (typeof(self._inc) !== 'object' || self._inc === undefined)
        self._inc = null;

    return self;
};

MongoBuilder.prototype.find = function(collection, fields) {

    var self = this;
    var take = self._take;
    var skip = self._skip;

    var arg = [];
    arg.push(self.builder);

     if (fields)
        arg.push(fields);

    var cursor = collection.find.apply(collection, arg);

    if (skip > 0)
        cursor.skip(skip);
    if (take > 0)
        cursor.limit(take);
    if (self._sort)
        cursor.sort(self._sort);

    return cursor;
};

MongoBuilder.prototype.one = function(collection, fields, callback) {
    return this.findOne(collection, fields, callback);
};

MongoBuilder.prototype.findOne = function(collection, fields, callback) {

    var self = this;
    var arg = [];

    arg.push(self.builder);

     if (fields)
        arg.push(fields);

    if (callback)
        arg.push(callback);

    collection.findOne.apply(collection, self.builder, fields, callback);
    return self;
};

MongoBuilder.prototype.update = function(collection, options, callback) {
    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = function(){};

    var arg = [];

    arg.push(self.builder);
    arg.push(self.getUpdate());

     if (options)
        arg.push(options);

    if (callback)
        arg.push(callback);

    collection.update.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.remove = function(collection, options, callback) {
    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = function(){};

    var arg = [];

    arg.push(self.builder);
    arg.push(self.getUpdate());

     if (options)
        arg.push(options);

    if (callback)
        arg.push(callback);

    collection.remove.apply(collection, arg);
    return upd;
};

MongoBuilder.prototype.getFilter = function() {
    return this.builder;
};

MongoBuilder.prototype.getUpdate = function() {
    var self = this;
    var upd = {};
    if (self._set)
        upd = { '$set': self._set };
    if (self._inc)
        upd = { '$inc': self._inc };
    return upd;
};

exports.MongoBuilder = MongoBuilder;
global.MongoBuilder = MongoBuilder;