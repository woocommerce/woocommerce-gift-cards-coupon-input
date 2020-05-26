/* jshint node:true */
module.exports = function( grunt ) {

	'use strict';

	var request = require( 'request' );

	/**
	 * Init config.
	 */
	grunt.initConfig( {

		// Get access to package.json.
		pkg: grunt.file.readJSON( 'package.json' ),

		// Setting dir paths.
		dirs: {
			css:    'assets/css',
			sass:   'assets/sass',
			js:     'assets/js',
			deploy: 'deploy' // Tip: create a deploy/ and ignore it.
		},

		// Generate POT files.
		makepot: {
			options: {
				type: 'wp-plugin',
				domainPath: 'languages',
				potHeaders: {
					'report-msgid-bugs-to': 'https://woocommerce.com/my-account/create-a-ticket/',
					'language-team': 'LANGUAGE <EMAIL@ADDRESS>'
				}
			},
			go: {
				options: {
					potFilename: 'woocommerce-gift-cards-coupon-input.pot',
					exclude: [
						'languages/.*',
						'assets/.*',
						'node-modules/.*',
					]
				}
			}
		},

		// Check textdomain errors.
		checktextdomain: {
			options:{
				text_domain: [ 'woocommerce-gift-cards-coupon-input' , 'woocommerce-gift-cards' ],
				keywords: [
					'__:1,2d',
					'_e:1,2d',
					'_x:1,2c,3d',
					'esc_html__:1,2d',
					'esc_html_e:1,2d',
					'esc_html_x:1,2c,3d',
					'esc_attr__:1,2d',
					'esc_attr_e:1,2d',
					'esc_attr_x:1,2c,3d',
					'_ex:1,2c,3d',
					'_n:1,2,4d',
					'_nx:1,2,4c,5d',
					'_n_noop:1,2,3d',
					'_nx_noop:1,2,3c,4d'
				]
			},
			files: {
				src:  [
					'**/*.php', // Include all files
					'!apigen/**', // Exclude apigen/
					'!deploy/**', // Exclude deploy/
					'!node_modules/**' // Exclude node_modules/
				],
				expand: true
			}
		},

		exec: {
			options: {
				shell: '/bin/bash'
			},
			test: {
				cmd: function() {
					grunt.log.ok( 'Unit Testing...' );
					return 'phpunit --testsuite unit';
				}
			},
			phpcs: {
				cmd: function() {
					grunt.log.ok( 'Running PHPCS...' );
					return './vendor/bin/phpcs --warning-severity=0 -s --extensions=php,html .';
				}
			},
			phpcs_security: {
				cmd: function() {
					grunt.log.ok( 'Running PHPCS for critical security sniffs...' );

					var sniffs = [
						'WordPress.Security.ValidatedSanitizedInput',
						'WordPress.DateTime.RestrictedFunctions',
						'Generic.PHP.ForbiddenFunctions'
					];
					return './vendor/bin/phpcs --warning-severity=0 -s --sniffs=' + sniffs.join( ',', sniffs ) + ' --extensions=php,html .';
				}
			},
			npm_install: {
				cmd: function() {
					grunt.log.ok( 'Running npm install...' );
					return 'npm install';
				}
			},
			upload: {
				cmd: function( filename ) {

					var path     = grunt.config.process( '<%= dirs.deploy %>' ),
						filepath = path + '/' + filename;

					return "(echo put " + filepath + ".zip && echo chmod 644 " + filename + ".zip) | sftp -q support@somewherewarm.gr:/home/support/uploads";
				}
			},
			zip: {
				cmd: function( filename, title ) {
					var path = grunt.config.process( '<%= dirs.deploy %>' );
					grunt.log.ok( 'Compressing files...' );

					var excludes = [
						'-x "*/node_modules/*"',
						'-x "*/vendor/*"',
						'-x "*/assets/sass/*"',
						'-x "*/assets/css/*.map"',
						'-x "*/assets/js/frontend/src/*"',
						'-x "*/assets/js/admin/src/*"',
						'-x "*/tests/*"',
						'-x "*/deploy/*"',
						'-x "*/.sass-cache/*"',
						'-x "*/.git/*"',
						'-x "*/Gruntfile.js"',
						'-x "*/phpunit.xml"',
						'-x "*/phpcs.xml"',
						'-x "*/package.json"',
						'-x "*/package-lock.json"',
						'-x "*/composer.json"',
						'-x "*/composer.lock"',
						'-x "*/README.md"',
						'-x "*/codeception.yml"',
						'-x "*/.DS_Store"',
						'-x "*/.gitignore"',
						'-x "*/.travis.yml"',
						'-x "*/._*"'
					];

					var cmd = 'cd .. && zip -qFSr ' + title + '/' + path + '/' + filename + '.zip ' + title + ' ' + excludes.join( ' ' );
					grunt.log.ok( 'Running: ' + cmd );
					return cmd;
				}
			}
		}

	});

	// Load NPM tasks to be used here
	grunt.loadNpmTasks( 'grunt-wp-i18n' );
	grunt.loadNpmTasks( 'grunt-checktextdomain' );
	grunt.loadNpmTasks( 'grunt-exec' );

	grunt.registerTask( 'default', [
		'checktextdomain',
		'makepot'
	] );

	grunt.registerTask( 'build', [
		'checktextdomain',
		'makepot'
	] );

	/**
	 * Function to get the release download key from the server.
	 */
	grunt.registerTask( 'get_download_key', function( filename ) {

		var done    = this.async(),
			options = {
				url: 'https://somewherewarm.gr/download.php?get=key&file=' + filename + '.zip',
				headers: {
					'Content-Type': 'text/plain'
				}
		};

		grunt.log.ok( 'Request download key from somewherewarm.gr...' );
		request( options, function( error, response, body ) {

			var key_regex = /<body>(.*?)<\/body>/g,
				key       = key_regex.exec( body )[ 1 ],
				url       = 'https://somewherewarm.gr/download.php?get=' + key;

			grunt.log.writeln( 'Download link:'['green'].bold );

			grunt.log.writeln( url['yellow'].bold );

			done();
		} );

	} );

	/**
	 * Function to validate version numbers in the extension's codebase.
	 */
	grunt.registerTask( 'validate_version', function( title, isDeployment ) {

		if ( ! isDeployment || isDeployment == 'false' ) {
			isDeployment = false;
		}

		// Get json version.
		var	version = grunt.config.process( '<%= pkg.version %>' );

		grunt.log.ok( 'Parsing version numbers...' );

		// Init files.
		var main_file      = grunt.file.read( title + '.php', { encoding: 'utf8' } ),
			readme_file    = grunt.file.read( 'readme.txt', { encoding: 'utf8' } ),
			changelog_file = grunt.file.read( 'changelog.txt', { encoding: 'utf8' } );

		// Parse version number form the readme file.
		var main_version_reg        = /public static \$version = \'([0-9\.]+[-dev]*)([0-9\.]*)\'\;$/gm,
			main_version_reg_header = / Version: ([0-9\.]+[-dev]*)$/gm,
			main_version            = main_version_reg.exec( main_file )[ 1 ],
			main_version_header     = main_version_reg_header.exec( main_file )[ 1 ];

		// Parse version number form the readme file.
		var readme_version_reg = /Stable tag: ([0-9\.]+[-dev]*)$/gm,
			readme_version     = readme_version_reg.exec( readme_file )[ 1 ];

		// Parse version number form the changelog file.
		var changelog_version_reg = / version ([0-9\.]+[-dev]*)/gm,
			changelog_version     = changelog_version_reg.exec( changelog_file )[ 1 ];

		grunt.log.writeln( 'Version package.json:', version['yellow'] );
		grunt.log.writeln( 'Version Readme:', readme_version['yellow'] );
		grunt.log.writeln( 'Version Main Header:', main_version_header['yellow'] );
		grunt.log.writeln( 'Version Main:', main_version['yellow'] );
		grunt.log.writeln( 'Version Changelog:', changelog_version['yellow'] );

		grunt.log.ok( 'Checking version numbers...' );

		var errors = [];

		if ( main_version != main_version_header ) {
			errors.push( 'Main\'s property version does not match header\'s version.' );
		}

		if ( isDeployment ) {

			if ( version != main_version ) {
				errors.push( 'package.json version does not match with main file\'s version.' );
			}

			if ( version != readme_version ) {
				errors.push( 'package.json version does not match with readme file\'s version.' );
			}

			if ( version != changelog_version ) {
				errors.push( 'package.json version does not match with changelog file\'s version.' );
			}

		} else {

			grunt.log.ok( 'Prereleasing requires a "-dev" suffix in version numbers...' );

			if ( main_version.indexOf( '-dev' ) == -1 ) {
				errors.push( 'Main\'s version does not include a "-dev" suffix.' );
			}

			if ( version != main_version.substring( 0, main_version.length - 4 ) ) { // Info: "-dev" is 4 chars in count.
				errors.push( 'package.json version does not match with main file\'s suffixed "-dev" version.' );
			}
		}

		if ( errors.length > 0 ) {
			grunt.fail.fatal( '\n• ' + errors.join('\n• ') );
		}

		grunt.log.writeln( 'Versions checked successfully. Moving on...'['green'].bold );
	} );

	/**
	 * Build and Upload a new Release.
	 *
	 * @deprecated Replaced by Travis CS Process
	 */
	grunt.registerTask( 'deploy', function() {

		var done  = this.async(),
			title = grunt.config.process( '<%= pkg.title %>' );

		// Sluggify title.
		title = 'woocommerce-gift-cards-coupon-input';

		grunt.task.run( [
			'validate_version:' + title + ':' + true,
			'exec:npm_install',
			'build',
			// 'exec:test',
			'exec:zip:' + title + ':' + title,
			'exec:upload:' + title,
			'get_download_key:' + title
		] );

		done();
	} );

	/**
	 * Build and Upload a new PRE-Release.
	 */
	grunt.registerTask( 'prerelease', function() {

		var done    = this.async(),
			title   = grunt.config.process( '<%= pkg.title %>' ),
			version = grunt.config.process( '<%= pkg.version %>' );

		// Sluggify title.
		title = 'woocommerce-gift-cards-coupon-input';

		var zip_name     = title + '-' + version,
			zip_name_dev = zip_name + '-dev';

		grunt.task.run( [
			'validate_version:' + title + ':' + false,
			'exec:npm_install',
			'build',
			'exec:zip:' + zip_name_dev + ':' + title,
			'exec:upload:' + zip_name_dev,
			'get_download_key:' + zip_name_dev
		] );

		done();
	} );
};
