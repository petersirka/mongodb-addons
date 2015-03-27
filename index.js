var Cursor = require('mongodb').Cursor;
var Util = require('util');
var O = require('mongodb').BSONPure.ObjectID;
var NUMBER = 'number';
var STRING = 'string';
var BOOLEAN = 'boolean';
var NOOP = function(){};

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
    this._filter = null;
    this._sort = null;
    this._skip = skip >= 0 ? skip : 0;
    this._take = take >= 0 ? take : 0;
    this._scope = 0;
    this._inc = null;
    this._set = null;
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

    if (!self._filter)
        self._filter = {};

    if (self._scope === 0) {
        self._filter[name] = obj;
        return self;
    }

    if (self._scope === 1) {
        if (!self._filter['$or'])
            self._filter['$or'] = [];
        var filter = {};
        filter[name] = obj;
        self._filter['$or'].push(filter);
    }

    if (self._scope === 1) {
        if (!self._filter['$and'])
            self._filter['$and'] = [];
        var filter = {};
        filter[name] = obj;
        self._filter['$and'].push(filter);
    }

    return self;
};

MongoBuilder.prototype.in = function(name, value) {
    return this.scope(name, { '$in': value });
};

MongoBuilder.prototype.nin = function(name, value) {
    return this.scope(name, { '$nin': value });
};

MongoBuilder.prototype.clone = function(onlyFilter) {
    var self = this;
    var B = new MongoBuilder(self._skip, self._take);

    if (self._filter)
        B._filter = Util._extend({}, self._filter);

    if (self._sort)
        B._sort = Util._extend({}, self._sort);

    if (self._agg)
        B._agg = Util._extend({}, self._agg);

    B._scope = self._scope;

    if (!onlyFilter) {

        if (self._inc)
            B._inc = Util._extend({}, self._inc);

        if (self._set)
            B._set = Util._extend({}, self._set);
    }

    return B;
};

MongoBuilder.prototype.merge = function(B, rewrite, onlyFilter) {

    var self = this;
    var keys = Object.keys(B._filter);

    for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        if (rewrite)
            self._filter[key] = B._filter[key];
        else if (self._filter[key] === undefined)
            self._filter[key] = B._filter[key];
    }

    if (B._sort) {
        keys = Object.keys(B._sort);

        if (self._sort)
            self._sort = {};

        for (var i = 0, length = keys.length; i < length; i++) {
            var key = keys[i];
            if (rewrite)
                self._sort[key] = B._sort[key];
            else if (self._sort[key] === undefined)
                self._sort[key] = B._sort[key];
        }
    }

    if (B._agg) {
        keys = Object.keys(B._agg);

        if (self._agg)
            self._agg = {};

        for (var i = 0, length = keys.length; i < length; i++) {
            var key = keys[i];
            if (rewrite)
                self._agg[key] = B._agg[key];
            else if (self._agg[key] === undefined)
                self._agg[key] = B._agg[key];
        }
    }

    if (onlyFilter)
        return self;

    if (B._set) {
        keys = Object.keys(B._set);

        if (self._set)
            self._set = {};

        for (var i = 0, length = keys.length; i < length; i++) {
            var key = keys[i];
            if (rewrite)
                self._set[key] = B._set[key];
            else if (self._set[key] === undefined)
                self._set[key] = B._set[key];
        }
    }

    if (B._inc) {
        keys = Object.keys(B._inc);

        if (self._inc)
            self._inc = {};

        for (var i = 0, length = keys.length; i < length; i++) {
            var key = keys[i];
            if (rewrite)
                self._inc[key] = B._inc[key];
            else if (self._inc[key] === undefined)
                self._inc[key] = B._inc[key];
        }
    }

    return self;
};

MongoBuilder.prototype.destroy = function() {
    var self = this;
    self._filter = null;
    self._set = null;
    self._inc = null;
    self._agg = null;
    return self;
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

MongoBuilder.prototype.set = function(name, model, skip) {
    var self = this;

    if (self._set === null)
        self._set = {};

    var type = typeof(name);

    if (type === 'string') {
        self._set[name] = model;
        return self;
    }

    if (model instanceof Array) {
        var keys = Object.keys(name);
        for (var i = 0, length = keys.length; i < length; i++) {
            var key = keys[i];
            if (key[0] === '$')
                continue;
            if (skip) {
                if (model.indexOf(key) === -1)
                    self._set[key] = name[key];
            } else {
                if (model.indexOf(key) !== -1)
                    self._set[key] = name[key];
            }
        }
        return self;
    }

    Util._extend(self._set, model);

    if (self._set._id)
        delete self._set._id;

    return self;
};

MongoBuilder.prototype.clearFilter = function(skip, take) {
    var self = this;
    self._skip = self.parseInt(skip);
    self._take = self.parseInt(take);
    self._filter = null;
    self._scope = 0;
    return self;
};

MongoBuilder.prototype.clearSort = function() {
    this._sort = null;
    return this;
};

MongoBuilder.prototype.clearAggregate = function() {
    this._agg = null;
    return this;
};

MongoBuilder.prototype.clearSet = function() {
    this._set = null;
    return this;
};

MongoBuilder.prototype.clearInc = function() {
    this._inc = null;
    return this;
};

MongoBuilder.prototype.clear = function(skip, take) {
    var self = this;
    self._filter = null;
    self._sort = null;
    self._skip = self.parseInt(skip);
    self._take = self.parseInt(take);
    self._scope = 0;
    self._inc = null;
    self._set = null;
    self._agg = null;
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
    var options = {};

    options.filter = self._filter;
    options.take = self._take;
    options.skip = self._skip;

    if (self._inc)
        options.inc = self._inc;

    if (self._set)
        options.set = self._set;

    if (self._agg)
        options.agg = self._agg;

    return JSON.stringify(options);
};

MongoBuilder.prototype.load = function(value) {

    if (typeof(value) === 'string')
        value = JSON.parse(value);

    var self = this;

    self._filter = value.filter;
    self._take = self.parseInt(value.take);
    self._skip = self.parseInt(value.skip);
    self._set = value.set;
    self._inc = value.inc;
    self._agg = value.agg;

    if (typeof(self._filter) !== 'object' || self._filter === null || self._filter === undefined)
        self._filter = {};

    if (typeof(self._set) !== 'object' || self._set === undefined)
        self._set = null;

    if (typeof(self._inc) !== 'object' || self._inc === undefined)
        self._inc = null;

    if (typeof(self._agg) !== 'object' || self._agg === undefined)
        self._agg = null;

    return self;
};

MongoBuilder.prototype.findArrayCount = function(collection, fields, callback) {

    var self = this;
    var take = self._take;
    var skip = self._skip;
    var arg = [];

    if (typeof(fields) === 'function') {
        callback = fields;
        fields = undefined;
    }

    arg.push(self.getFilter());

     if (fields)
        arg.push(fields);

    var cursor = collection.find.apply(collection, arg);

    cursor.count(function(err, count) {
        if (err)
            return callback(err);
        cursor = collection.find.apply(collection, arg);
        if (skip > 0)
            cursor.skip(skip);
        if (take > 0)
            cursor.limit(take);
        if (self._sort)
            cursor.sort(self._sort);
        cursor.toArray(function(err, docs) {
            callback(err, docs, count);
        });
    });

    return self;
};

MongoBuilder.prototype.findArray = function(collection, fields, callback) {
    this.find(collection, fields).toArray(callback);
    return this;
};

MongoBuilder.prototype.count = function(collection, callback) {
    var self = this;
    var arg = [];
    arg.push(self.getFilter());
    collection.find.apply(collection, arg).count(callback);
    return self;
};

MongoBuilder.prototype.find = function(collection, fields) {

    var self = this;
    var take = self._take;
    var skip = self._skip;

    var arg = [];
    arg.push(self.getFilter());

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

    arg.push(self.getFilter());

     if (fields)
        arg.push(fields);

    if (callback)
        arg.push(callback);

    collection.findOne.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.insert = function(collection, options, callback) {
    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = NOOP;

    var arg = [];

    arg.push(self.getInsert());

     if (options)
        arg.push(options);

    if (callback)
        arg.push(callback);

    collection.insert.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.update = function(collection, options, callback) {
    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = NOOP;

    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }

    if (!options)
        options = {};

    options.multi = true;

    var arg = [];

    arg.push(self.getFilter());
    arg.push(self.getUpdate());

    if (options)
        arg.push(options);

    if (callback)
        arg.push(callback);

    collection.update.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.updateOne = function(collection, options, callback) {

    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = NOOP;

    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }

    if (!options)
        options = {};

    options.multi = false;

    var arg = [];

    arg.push(self.getFilter());
    arg.push(self.getUpdate());
    arg.push(options);

    if (callback)
        arg.push(callback);

    collection.update.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.remove = function(collection, options, callback) {
    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = NOOP;

    var arg = [];

    arg.push(self.getFilter());

    if (options)
        arg.push(options);

    if (callback)
        arg.push(callback);

    collection.remove.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.removeOne = function(collection, options, callback) {
    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = NOOP;

    if (typeof(options) === 'function') {
        callback = options;
        options = {};
    }

    if (!options)
        options = {};

    options.single = true;

    var arg = [];

    arg.push(self.getFilter());

     if (options)
        arg.push(options);

    if (callback)
        arg.push(callback);

    collection.remove.apply(collection, arg);
    return self;
};

MongoBuilder.prototype.getFilter = function() {
    return this._filter ? this._filter : {};
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

MongoBuilder.prototype.getInsert = function() {
    var self = this;
    var ins = {};
    if (self._set)
        ins = self._set;
    if (!ins._id)
        ins._id = new ObjectID();
    return ins;
};

MongoBuilder.prototype.aggregate = function(collection, options, callback) {

    var self = this;

    if ((options === undefined && callback === undefined) || (typeof(options) === 'object' && callback === undefined))
        callback = NOOP;

    if (typeof(options) === 'function') {
        callback = options;
        options = undefined;
    }

    var keys = Object.keys(self._agg);
    var pipeline = [];

    if (self._filter)
        pipeline.push({ $match: self._filter });

    for (var i = 0, length = keys.length; i < length; i++) {
        var tmp = {};
        tmp[keys[i]] = self._agg[keys[i]];
        pipeline.push(tmp);
    }

    if (self._sort)
        pipeline.push({ $sort: self._sort });

    if (self._take > 0)
        pipeline.push({ $limit: self._take });

    if (self._skip > 0)
        pipeline.push({ $skip: self._skip });

    if (options)
        collection.aggregate(pipeline, options, callback);
    else
        collection.aggregate(pipeline, callback);

    return self;
};

MongoBuilder.prototype.group = function(id, path) {
    var self = this;

    if (!self._agg)
        self._agg = {};

    if (!self._agg.$group)
        self._agg.$group = {};

    if (id.substring(0, 3) !== '_id')
        id = '_id.' + id;

    makeAgg(self._agg.$group, id);

    if (path)
        makeAgg(self._agg.$group, path);

    return self;
};

MongoBuilder.prototype.project = function(path) {
    var self = this;

    if (!self._agg)
        self._agg = {};

    if (!self._agg.$project)
        self._agg.$project = {};

    makeAgg(self._agg.$project, path);
    return self;
};

MongoBuilder.prototype.unwind = function(path) {
    var self = this;

    if (!self._agg)
        self._agg = {};

    if (path[0] !== '$')
        path = '$' + path;

    self._agg.$unwind = path;
    return self;
};

function makeAgg(obj, path) {

    var arr = path.split('.');
    var value = arr.pop();
    var length = arr.length;

    if (value === '1' || value === '0')
        value = parseInt(value);
    else
        value = value === '' ? null : '$' + value;

    if (!obj)
        obj = {};

    if (!obj[arr[0]]) {
        if (length === 1) {
            obj[arr[0]] = value;
            return;
        }
        obj[arr[0]] = {};
    }

    var current = obj[arr[0]];

    for (var i = 1; i < length; i++) {
        var key = arr[i];

        if (!current[key]) {

            if (i === length - 1) {
                current[key] = value;
                break;
            }

            current[key] = {};
            current = current[key];
            continue;
        }

        if (i === length - 1) {
            if (current[key] instanceof Array)
                current[key].push(value);
            else
                current[key] = [current[key], value];
            break;
        }

        current = current[key];
    }
}

function readFile(db, id, callback) {
    var reader = new GridStore(db, ObjectID.parse(id), 'r');
    reader.open(function(err, fs) {

        if (err) {
            reader.close();
            reader = null;
            return callback(err);
        }

        callback(null, fs, function() {
            reader.close();
            reader = null;
        });
    });
}

function writeFile(db, id, filename, name, meta, callback) {

    if (!callback)
        callback = NOOP;

    if (typeof(meta) === 'function') {
        var tmp = callback;
        callback = meta;
        meta = tmp;
    }

    var arg = [];
    var grid = new GridStore(db, id ? id : new ObjectID(), name, 'w', { metadata: meta });

    grid.open(function(err, fs) {

        if (err) {
            grid.close();
            grid = null;
            return callback(err);
        }

        grid.writeFile(filename, function(err, doc) {
            if (err)
                return callback(err);
            callback(null);
            grid.close();
            grid = null;
        });
    });
}

GridStore.readFile = readFile;
GridStore.writeFile = writeFile;
exports.MongoBuilder = MongoBuilder;
global.MongoBuilder = MongoBuilder;