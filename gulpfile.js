'use strict';

const gulp = require('gulp');
const sass = require('gulp-sass');
const concat = require('gulp-concat');
const autoprefixer = require('gulp-autoprefixer');
const babel = require('gulp-babel');


gulp.task('styles', () => {
	return gulp.src('./sass/**/*.scss')
	.pipe(sass().on('error', sass.logError))
	.pipe(autoprefixer())
	.pipe(concat('style.css'))
	.pipe(gulp.dest('./public/'))
});


gulp.task('scripts', () => {
	return gulp.src('./scripts/**/*.js')
	.pipe(babel({
		presets: ['es2015']
	}))
	.pipe(concat('main.js'))
	.pipe(gulp.dest('./public/'))
});

gulp.task('watch', () =>{
	gulp.watch('./sass/**/*.scss', ['styles']);
	gulp.watch('./scripts/**/*.js', ['scripts']);
});

gulp.task('default', ['styles', 'scripts', 'watch']);