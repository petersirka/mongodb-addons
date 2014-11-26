var Cursor = require('mongodb').Cursor;

global.ObjectID = require('mongodb').ObjectID;
global.GridStore = require('mongodb').GridStore;

Cursor.prototype.join = function(source, target, collection, fields) {

    var self = this;

    if (!self.pop)
        self.pop = [];

    var item = { relation: [], source: source, target: target, collection: collection, fields: fields === undefined ? null : fields };

    self.each(function(err, doc) {
        if (doc === null)
            return;
        var value = doc[item.source];
        if (value !== null && value !== undefined) {
            if (value instanceof Array)
                item.relation.push.apply(item.relation, value);
            else
                item.relation.push(value);
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

        var done = function() {
            for (var a = 0, al = rows.length; a < al; a++) {
                var row = rows[a];
                for (var b = 0, bl = self.pop.length; b < bl; b++) {
                    var pop = self.pop[b];
                    var source = row[pop.source];
                    var length = source ? source.length || 0 : 0;

                    if (length > 0)
                        row[pop.target] = [];

                    for (var c = 0, cl = pop.result.length; c < cl; c++) {
                        var join = pop.result[c];
                        if (length === 0) {
                            if (join._id.equals(source)) {
                                rows[a][pop.target] = join;
                                break;
                            }
                        } else {
                            for (var d = 0; d < length; d++) {
                                if (join._id.equals(source[d]))
                                    rows[a][pop.target].push(join);
                            }
                        }
                    }
                }
            }
            callback(null, rows);
        };

        self.pop.wait(function(item, next) {
            var filter = { _id: { $in: item.relation }};
            db.collection(item.collection).find(filter, item.fields).toArray(function(err, docs) {
                item.result = docs;
                next();
            });
        }, done);

    });

    return self;
};

ObjectID.parse = function(value) {
    if (value.toString().length !== 24)
        return ''.padLeft(24, '0');
    return new ObjectID(value);
};

ObjectID.parseArray = function(value) {

    if (typeof(value) === 'string')
        value = value.split(',');

    var arr = [];
    for (var i = 0, length = value.length; i < length; i++)
        arr.push(ObjectID.parse(value[i]));

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