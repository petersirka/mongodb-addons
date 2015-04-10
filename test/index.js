var assert = require('assert');
var MC = require('mongodb').MongoClient;
var db, D;
require('..');

MC.connect('mongodb://localhost:27017/local', function(err, d) {
    db = d.collection('mongoaddons');
    D = d;
    console.time('test');
    db.drop(function() {
        insert(function() {
            select(function() {
                update(function() {
                    remove(function() {
                        tools(function() {
                            console.log('==== DONE ====');
                            console.timeEnd('test');
                            D.close();
                        });
                    });
                });
            });
        });
    });
});

function insert(next) {
    var builder = new MongoBuilder();
    builder.set('name', 'Peter');
    builder.set({ age: 30 });
    builder.set('_id', 'A');
    builder.set('female', false);
    builder.insert(db, function(err, r) {
        assert.ok(r[0]._id === 'A', 'insert 0');
        builder.clear();
        builder.set('name', 'Lucia');
        builder.set({ age: 33 });
        builder.set('_id', 'B');
        builder.set('female', true);
        builder.insert(db, function(err, r) {
            assert.ok(r[0]._id === 'B', 'insert 1');
            builder.clear();
            builder.set('name', 'Anna');
            builder.set({ age: 1 });
            builder.set('_id', 'C');
            builder.set('female', true);
            builder.insert(db, function(err, r) {
                assert.ok(r[0]._id === 'C', 'insert 2');
                builder.destroy();
                next();
            });
        });
    });
}

function update(next) {
    var builder = new MongoBuilder();
    builder.where('_id', '=', 'A');
    builder.set('female', true);
    builder.inc('age', 10);
    builder.updateOne(db, function(err, r) {
        assert.ok(r === 1, 'updateOne');
        builder.findOne(db, function(err, doc) {
            assert.ok(doc.age === 40, 'updateOne (inc)');
            builder.clearUpdate();
            builder.push('tags', 'node.js');
            builder.updateOne(db, function(err, r) {
                assert.ok(r === 1, 'updateOne (push 1)');
                builder.clearUpdate();
                builder.push('tags', 'total.js');
                builder.updateOne(db, function(err, r) {
                    assert.ok(r === 1, 'updateOne (push 2)');
                    builder.findOne(db, function(err, doc) {
                        assert.ok(doc.tags[1] === 'total.js', 'updateOne (push 3)');
                        builder.clearUpdate();
                        builder.addToSet('tags', { $each: ['total.js', 'mongodb'] });
                        builder.updateOne(db, function(err, r) {
                            builder.findOne(db, function(err, doc) {
                                assert.ok(doc.tags.length === 3, 'updateOne (addToSet)');
                                builder.clearUpdate();
                                builder.pop('tags', 1);
                                builder.updateOne(db, function(err, r) {
                                    builder.findOne(db, function(err, doc) {
                                        assert.ok(doc.tags.length === 2, 'updateOne (pop)');
                                        builder.clearUpdate();
                                        builder.unset('tags');
                                        builder.rename('age', 'vek');
                                        builder.updateOne(db, function(err, r) {
                                            builder.findOne(db, function(err, doc) {
                                                assert.ok(!doc.tags, 'updateOne (unset)');
                                                assert.ok(doc.vek === 40, 'updateOne (rename)');
                                                next();
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

function select(next) {

    var builder = new MongoBuilder();

    builder.or();
    builder.where('_id', 'A');
    builder.where('_id', 'C');
    builder.end();

    builder.find(db).toArray(function(err, docs) {
        assert.ok(docs.length === 2, 'select 0 (where)');
        assert.ok(docs[0]._id === 'A', 'select 1 (where)');

        builder.clear();
        builder.between('age', 0, 30);

        builder.findArray(db, function(err, docs) {
            assert.ok(docs.length === 2, 'select 0 (between)');
            assert.ok(docs[0]._id === 'A', 'select 1 (between)');

            builder.clear();
            builder.regex('name', /a$/);

            builder.findArray(db, function(err, docs) {
                assert.ok(docs.length === 2, 'select 0 (regex)');
                assert.ok(docs[0]._id === 'B', 'select 1 (regex)');

                builder.clear();
                builder.take(1);
                builder.skip(1);

                builder.findArray(db, function(err, docs) {
                    assert.ok(docs.length === 1, 'select 0 (take/skip)');
                    assert.ok(docs[0]._id === 'B', 'select 1 (take/skip)');

                    builder.clear();
                    builder.in('_id', ['A', 'B']);

                    builder.findArray(db, function(err, docs) {
                        assert.ok(docs.length === 2, 'select 0 (in)');
                        assert.ok(docs[1]._id === 'B', 'select 1 (in)');

                        builder.clear();
                        builder.nin('_id', ['A', 'B']);

                        builder.findArray(db, function(err, docs) {
                            assert.ok(docs.length === 1, 'select 0 (nin)');
                            assert.ok(docs[0]._id === 'C', 'select 1 (nin)');

                            builder.clear();
                            builder.and();
                            builder.where('female', true);
                            builder.where('age', '>', 30);

                            builder.findArray(db, function(err, docs) {
                                assert.ok(docs.length === 1, 'select 0 (and)');
                                assert.ok(docs[0]._id === 'B', 'select 1 (and)');
                                next();
                            });
                        });
                    });
                });
            });
        });
    });
}

function remove(next) {
    var builder = new MongoBuilder();
    builder.where('age', '<>', 1);
    builder.remove(db, function(err, r) {
        assert.ok(r === 2, 'remove');
        builder.clear();
        builder.count(db, function(err, count) {
            assert.ok(count === 1, 'count');
            next();
        });
    });
}

function tools(next) {

    var a = new MongoBuilder();
    a.where('_id', 'A');
    a.set('name', 'Peter');
    a.inc('age', 10);
    a.push('tags', 'total.js');

    var save = a.save();

    assert.ok(save === '{"filter":{"_id":"A"},"take":0,"skip":0,"upd":{"$set":{"name":"Peter"},"$inc":{"age":10},"$push":{"tags":"total.js"}}}', 'save');

    var clone = a.clone();

    assert.ok(clone._upd.$push.length === a._upd.$push.length && clone._upd.$inc.age === a._upd.$inc.age, 'clone');

    clone.clearUpdate();
    clone.between('age', 10, 20);
    clone.set('name', 'Lucia');
    clone.inc('age', 1);
    clone.pop('tags', -1);

    a.merge(clone, true);
    assert.ok(a._upd.$pop.tags && a._upd.$push.tags && a._upd.$inc.age === 1, a._upd.$set.name === 'Lucia', 'merge');

    a = new MongoBuilder();
    a.load(save);
    assert.ok(a._upd.$push.tags === 'total.js' && a._upd.$inc.age === 10, a._upd.$set.name === 'Peter', 'load');

    next();
}

