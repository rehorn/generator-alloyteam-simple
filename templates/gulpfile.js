// =================
// alloyteam simple project build gulpfile
// author: rehornchen@tencent.com
// version: 0.8.0
// last update: 2016-08-11
// created: 2014-07-15
// history:
// 0.8.0 2016-08-11 update dependencies version & add babel-loader
// 0.7.0 2015-01-11 jade/ejs support, html extend support
// 0.6.1 2014-12-01 add liveproxy support
// 0.5.0 2014-11-24 refact: js modular with webpack
// 0.4.2 2014-10-2 add jsrefs debug support
// 0.4.1 2014-09-30 add cmd line publish support
// 0.3.17 2014-09-30 add retina sprite support
// 0.3.16 2014-09-29 remove requirement of build:htmlrefs comment 
// 0.3.0 2014-07-17 adapt to slush generator
// 0.2.0 2014-07-15 support htmlrefs rev alloykit-offline
// 0.1.0 2014-07-15 init
// --------------------
// 不要修改以下内容
// =================
var gulp = require('gulp');
var runSequence = require('run-sequence');

var fs = require('fs');
var path = require('path');
var url = require('url');
var exec = require('child_process').exec;
var _ = require('lodash');
var async = require('async');
var request = require('request');
var del = require('del');
var vinylPaths = require('vinyl-paths');
var liveproxy = require('liveproxy');

var compass = require('gulp-compass'),
    rev = require('gulp-rev'),
    uglify = require('gulp-uglify'),
    cleanCSS = require('gulp-clean-css'), // replace gulp-minify-css to gulp-clean-css
    // imagemin = require('gulp-imagemin'),
    minifyHtml = require('gulp-minify-html'),
    savefile = require('gulp-savefile'),
    webpack = require('webpack-stream'),
    htmlrefs = require('gulp-htmlrefs'),
    zip = require('gulp-zip'),
    extender = require('gulp-html-extend'),
    gulpIf = require('gulp-if'),
    newer = require('gulp-newer');
// =================
// configs
// =================
var configs = {
    // about site global
    name: 'alloyteam-simple-default',
    cdn: 'http://s.url.cn/qqun/',
    webServer: 'http://find.qq.com/',
    subModule: '/',

    // path 相关
    src: './src/',
    dist: './dist/',
    deploy: './public/',

    // 路径配置
    // css: './css/',
    // js: './js/',
    // tpl: './tpl/',
    // img: './img/',
    // libs: './libs/',

    // webpack
    webpack: {},

    // liveproxy
    liveproxy: 1,

    // 图片格式
    // imgType: '*.{jpg,jpeg,png,bmp,gif,ttf,ico,htc}',
    imgType: '*.*',

    // compress related
    minifyHtml: 0,
    minifyImage: 0,

    // jb support
    JBSupport: 1,

    JB_URL: 'http://fakeurl.com',

    ARS_URL: 'http://fake2url.com',

    // 使用发布离线包
    offline: {
        // 'bid': 128, // alloykit bid, 需要修改
        // 'publish': true,
        // 'compatible': 0,
        // 'qversionfrom': 0,
        // 'qversionto': 0,
        // 'platform': [2, 3],
        // 'loadmode': 2,
        // 'verifyType': 0,
        // 'expire_time': 1577836800000,
        // 'cdn': 'defaultCDN',
        // 'note': '',
        // 'frequency': 1,
        // 'gray': true,
        // 'uins': []
    },
    // 是否需要打 zip 包
    zip: 1,
    // zip 包路径配置
    zipConf: [],
    // zip 名称
    zipName: 'offline.zip',
    // 离线包黑名单 
    zipBlacklist: [],
    // jb cli 发布相关,发布单号，用于命令行发布
    distId: '',
    opUser: 'alloy-gulp',
    token: 'ASdxseRTSXfiGUIxnuRisTU'
};

// internal tmp path related
var _path = {
    offlineCache: './.offline/',
    tmp: './.tmp/',
    cssRev: './.tmp/.cssrev/',
    jsRev: './.tmp/.jsrev/',
};

// overwrite configs
var projectConfig = require('./project') || {};
projectConfig.webpack = projectConfig.webpack || {};
var isWebpackEntry = projectConfig.webpack.entry ? true : false;
_.extend(configs, _path, projectConfig);

// overwrite user define value
if (fs.existsSync('./userdef.js')) {
    _.extend(configs, require('./userdef') || {});
}

// prepare root with subModule case
configs.cdnRoot = (configs.subModule === '/') ? configs.cdn : configs.cdn + configs.subModule;
configs.webServerRoot = (configs.subModule === '/') ? configs.webServer : configs.webServer + configs.subModule;

// global vars
var src = configs.src,
    dist = configs.dist,
    tmp = configs.tmp,
    deploy = configs.deploy,
    offlineCache = configs.offlineCache;

// default src folder options
var opt = {
    cwd: src,
    base: src
};
var distOpt = {
    cwd: dist,
    base: dist
};

// dev watch mode
var isWatching = false;
var isWebpackInit = false;

// set default alloykit offline zip config
var globCdn = ['**/*.*', '!**/*.{html,ico}'];
var globWebServer = ['**/*.{html,ico}'];
if (configs.zip && _.isEmpty(configs.zipConf)) {
    configs.zipConf = [{
        target: configs.cdnRoot,
        include: globCdn
    }, {
        target: configs.webServerRoot,
        include: globWebServer
    }];

    if (!_.isEmpty(configs.zipBlacklist)) {
        // prefix '!' to exclude
        _.map(configs.zipBlacklist, function(item) {
            return '!' + item;
        });
        // union
        _.each(configs.zipConf, function(item) {
            _.union(item.include, configs.zipBlacklist)
        });
    }
}

function initWebpackConfig() {
    var _cdn = isWatching ? '' : configs.cdn;
    var _webpack = {
        // cache: false,
        output: {
            // entry point dist file name
            filename: '[name].js',
            // aysnc loading chunk file root
            publicPath: 'js/',
            chunkFilename: isWatching ? 'chunk-[id].js' : 'chunk-[id]-[hash:8].js'
        }
    };
    _.extend(configs.webpack, _webpack);
    if (isWatching) {
        configs.webpack.devtool = '#inline-source-map';
    } else {
        configs.webpack.output.publicPath = configs.cdn + _webpack.output.publicPath;
    }

    _webpack.module = {
        loaders: [{
            test: /\.js$/,
            loader: 'babel-loader',
            query: {
                presets: ['es2015-loose']
            }
        },{
            test: /\.jade$/,
            loader: 'jade-loader'
        }, {
            test: /\.ejs$/,
            loader: 'ejs-compiled'
        }, {
            test: /common\/.*\.(png|jpg)$/,
            loader: 'file2?name=' + _cdn + 'img/common/' + '[name]-[hash:8].[ext]'
        }, {
            test: /static\/.*\.(png|jpg)$/,
            loader: 'file2?name=' + _cdn + 'img/static/' + '[name].[ext]'
        }, {
            test: /\.css$/,
            loader: isWatching ? 'style/url!file?name=chunk-[name].[ext]' : 'style/url!file?name=chunk-[name]-[hash:8].[ext]'
        }]
    };

    // set webpack module loader
    configs.webpack.module = configs.webpack.module || {};
    configs.webpack.module.loaders = _webpack.module.loaders;

    isWebpackInit = true;
};

function setWebpackEntry() {
    var res = [],
        entry = {};
    // user not define entry, auto gen from js/entry folder
    if (!isWebpackEntry) {
        var folder = path.join(src, 'js');
        var files = fs.readdirSync(folder);
        files.forEach(function(file) {
            var pathname = path.join(folder, file);
            var stat = fs.lstatSync(pathname);
            if (!stat.isDirectory()) {
                res.push(file);
            }
        });
        _.each(res, function(file) {
            var name = path.basename(file, '.js');
            entry[name] = src + 'js/' + file;
        });
        configs.webpack.entry = entry;
    }
};

function openBrowser(target, callback) {
    var map, opener;
    map = {
        'darwin': 'open',
        'win32': 'start '
    };
    opener = map[process.platform] || 'xdg-open';
    return exec('' + opener + ' ' + target, callback);
};

var customMinify = ['noop'];
var customJBFlow = ['noop'];
if (configs.minifyHtml) {
    customMinify.push('minifyHtml');
}
if (configs.minifyImage) {
    // customMinify.push('imagemin');
}
if (configs.JBSupport) {
    customJBFlow.push('jb:prepare');
    customJBFlow.push('ak:zip');
}

console.log('start to build project [' + configs.name + ']...');

// remove old or tmp files
gulp.task('clean', function(cb) {
    del([dist, tmp, deploy, offlineCache]).then(function(paths) {
        cb();
    });
});

// clean node_modules, fix windows file name to long bug..
gulp.task('cleanmod', function(cb) {
    del('./node_modules').then(function(paths) {
        cb();
    });
});

// clean all temp files
gulp.task('cleanall', function(cb) {
    del([dist, tmp, deploy, offlineCache, './.sass-cache']).then(function(paths) {
        cb();
    });
});

// copy js/html from src->dist
var things2copy = ['*.{html,ico}', 'libs/**/*.*', 'img/static/**/' + configs.imgType];
gulp.task('copy', function() {
    return gulp.src(things2copy, opt)
        .pipe(newer(dist))
        .pipe(gulpIf('*.html', extender()))
        .pipe(gulp.dest(dist));
});

// copy and rev some images files [filename-md5.png style]
var image2copy = '{img/,img/common/}' + configs.imgType;
gulp.task('img-rev', function() {
    // img root 
    return gulp.src(image2copy, opt)
        .pipe(newer(dist))
        .pipe(rev())
        .pipe(gulp.dest(dist));
});

// compile scss and auto spriting 
var scss2compile = '**/*.scss';
gulp.task('compass', function() {
    return gulp.src(scss2compile, opt)
        .pipe(newer(dist))
        .pipe(compass({
            config_file: './config.rb',
            css: path.join(dist, 'css'),
            sass: path.join(src, 'css'),
            image: path.join(src, 'img'),
            generated_image: path.join(dist, 'img/sprite')
        }))
});

// packer js using webpack
var js2webpack = src + 'js/**/*.js';
var tpl2webpack = src + 'tpl/**/*.*';
gulp.task('webpack', function() {
    !isWebpackInit && initWebpackConfig();
    setWebpackEntry();
    return gulp.src(js2webpack)
        .pipe(webpack(configs.webpack))
        .pipe(gulp.dest(dist + 'js/'));
});

// minify js and generate reversion files
// stand alone cmd to make sure all js minified
gulp.task('uglify', ['webpack'], function() {
    return gulp.src(['{' + dist + ',tmp}/**/*.js', '!' + dist + 'js/chunk-*.js'])
        .pipe(uglify())
        .pipe(vinylPaths(del))
        .pipe(rev())
        .pipe(savefile())
        .pipe(rev.manifest())
        .pipe(gulp.dest(configs.jsRev))
});

// minify css and generate reversion files
// stand alone cmd to make sure all css minified
gulp.task('minifyCss', ['compass'], function() {
    return gulp.src(['{' + dist + ',tmp}/**/*.css', '!' + dist + 'js/chunk-*.css'])
        .pipe(cleanCSS())
        .pipe(vinylPaths(del))
        .pipe(rev())
        .pipe(savefile())
        .pipe(rev.manifest())
        .pipe(gulp.dest(configs.cssRev))
});

// replace html/js/css reference resources to new md5 rev version
// inline js to html, or base64 to img
gulp.task('htmlrefs', function() {
    var mapping;
    var jsRev = configs.jsRev + 'rev-manifest.json';
    var cssRev = configs.cssRev + 'rev-manifest.json';
    if (fs.existsSync(jsRev) && fs.existsSync(cssRev)) {
        mapping = _.extend(
            require(jsRev),
            require(cssRev)
        );
    }

    var refOpt = {
        urlPrefix: configs.cdnRoot,
        scope: [dist],
        mapping: mapping
    };

    return gulp.src(dist + '*.html')
        .pipe(htmlrefs(refOpt))
        .pipe(gulp.dest(dist));
});

gulp.task('minifyHtml', function() {
    return gulp.src(src + '*.html')
        .pipe(minifyHtml({
            empty: true
        }))
        .pipe(savefile());
});

gulp.task('noop', function(cb) {
    cb();
});

// gulp.task('imagemin', function() {
//     return gulp.src(src + '**/' + configs.imgType)
//         .pipe(imagemin())
//         .pipe(savefile());
// });

// jb intergration task, build files to public folder
// html -> public/webserver/**  cdn -> public/cdn/**
gulp.task('jb:prepare', function(cb) {
    var deployGroup = [{
        target: deploy + 'cdn/' + configs.subModule,
        include: globCdn
    }, {
        target: deploy + 'webserver/' + configs.subModule,
        include: globWebServer
    }];

    var q = _.map(deployGroup, function(item) {
        return function(callback) {
            gulp.src(item.include, distOpt)
                .pipe(gulp.dest(item.target))
                .on('end', function() {
                    callback();
                });
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// prepare files to package to offline zip for alloykit
gulp.task('ak:prepare', function(cb) {
    var q = _.map(configs.zipConf, function(item) {
        return function(callback) {
            var urlObj = url.parse(item.target);
            var target = path.join(offlineCache, urlObj.hostname, urlObj.pathname);
            gulp.src(item.include, distOpt)
                .pipe(gulp.dest(target))
                .on('end', function() {
                    callback();
                });
        };
    });

    async.parallel(q, function(err, result) {
        cb(err, result);
    });
});

// package .offline -> offline.zip for alloykit
gulp.task('ak:zip', ['ak:prepare'], function() {
    return gulp.src('**/*.*', {
            cwd: offlineCache
        })
        .pipe(zip(configs.zipName))
        .pipe(gulp.dest(deploy + 'offline'));
});

var apiData = {
    did: configs.distId,
    opUser: configs.opUser,
    token: configs.token
};
// jb -> deloy test env
gulp.task('testenv', function() {
    // test env
    request.post(configs.JB_URL + '/dist/api/go', {
        form: apiData
    }, function(err, resp, body) {
        var data = JSON.parse(body);
        console.log(data);
    });
});

// jb -> prebuild and create ars publish order
gulp.task('ars', function() {
    // publish ars
    request.post(configs.JB_URL + '/dist/api/ars', {
        form: data
    }, function(err, resp, body) {
        var data = JSON.parse(body);
        if (data.code == 0) {
            var msg = JSON.parse(data.msg);
            if (!msg.result) {
                console.log('没有 ars 提单权限，请到' + configs.ARS_URL + ' 申请！');
            } else {
                openBrowser(configs.ARS_URL + '/Rel_TestManage.htm?orderid=' + msg.releasetag + '&showend=1');
            }
        }
    });
});

// jb -> prebuild and auto post offline zip
gulp.task('offline', function(cb) {
    // publish offline zip
    request.post(configs.JB_URL + '/dist/api/offline', {
        form: data
    }, function(err, resp, body) {
        var data = JSON.parse(body);
        console.log(data);
    });
});

// support local replacement & livereload
gulp.task('liveproxy', function(cb) {
    if (configs.liveproxy) {
        liveproxy({
            config: './livefile.js'
        });
    }
    cb();
});

gulp.task('watch:set', function() {
    isWatching = true;
});

gulp.task('watch', function() {
    gulp.watch(things2copy, opt, ['copy']);
    gulp.watch(image2copy, opt, ['img-rev']);
    gulp.watch(scss2compile, opt, ['compass']);
    gulp.watch(js2webpack, ['webpack']);
    gulp.watch(tpl2webpack, ['webpack']);
});

gulp.task('dev', function(cb) {
    runSequence(['clean', 'watch:set'], ['copy', 'img-rev', 'compass', 'webpack'], 'watch', 'liveproxy', cb);
});

gulp.task('dist', function(cb) {
    runSequence(
        'clean', ['copy', 'img-rev', 'compass', 'webpack', 'uglify', 'minifyCss'],
        'htmlrefs',
        customMinify,
        customJBFlow,
        cb);
});

gulp.task('default', ['dev']);
