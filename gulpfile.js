var gulp = require('gulp'),
  jshint = require('gulp-jshint'),
  stylish = require('jshint-stylish');

gulp.task('lint', function () {
  var glob = ['./lib/*.js',
    './bin/*.js',
    './chrome-extension/app.js',
    './chrome-extension/devtools.js']
  return gulp.src(glob)
    .pipe(jshint())
    .pipe(jshint.reporter(stylish));
});

gulp.task("default", ["lint"]);