import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import fs from 'fs'
import {tmpdir} from 'os'
import debos from './debos.js'
import Parse from './actions/index.js'

const checkForHost = ([k, v]) => {
	const isLocal = ['localhost', '127.0.0.1', '::1'].find(ip => v.includes(ip))
	isLocal && console.warn(
		`WARNING: Environment variable ${k} contains a reference to ${v}.
		This may not work when running from fakemachine.
		Consider using an address that is valid on your network.`
	)
	return isLocal
}

const options = yargs(hideBin(process.argv))
	.option('backend', {
		aliases: ['-fakemachine-backend', 'b'],
		describe: 'Fakemachine backend to use',
		choices: ['kvm', 'qemu', 'uml', 'auto'],
		default: 'auto'
	})
	.option('artifactDir', { describe: 'Directory for packed archives and ostree repositories', default: process.cwd()})
	.option('internalImage', {hidden: true})
	.option('templateVars', {alias: 't', describe: 'Template variables (use -t VARIABLE:VALUE syntax)', default: []})
	.option('debugShell', {describe: 'Fall into interactive shell on error', default: false})
	.option('shell', {alias: 's', describe: 'Redefine interactive shell binary', default: '/bin/bash'})
	.option('scratchSize', {describe: 'Size of disk backed scratch space'})
	.option('cpus', {alias: 'c', describe: 'Number of CPUs to use for build VM', default: 2})
	.option('memory', {alias: 'm', describe: 'Amount of memory for build VM in Megabytes (MB)', default: 2 * 1024})
	.option('showBoot', {describe: 'Show boot/console messages from the fake machine'})
	.option('environVars', {alias: 'e', describe: 'Environment variables (use -e VARIABLE:VALUE syntax)'})
	.option('verbose', {alias: 'v', describe: 'Verbose output', default: true})
	.option('printRecipe', {describe: 'Print final recipe', default: false})
	.option('dryRun', {describe: 'Compose final recipe to build but without any real work started', default: false})
	.option('disableFakeMachine', {describe: 'Do not use fakemachine.', default: true})
	.argv
const context = {}

// These are the environment variables that will be detected on the
// host and propagated to fakemachine. These are listed lower case, but
// they are detected and configured in both lower case and upper case.
const environ_vars = [ 'http_proxy', 'https_proxy', 'ftp_proxy', 'rsync_proxy', 'all_proxy', 'no_proxy' ]

const main = () => {

	if (!options._.length) return console.error('No recipe given!')

	if (options.disableFakeMachine && options.backend != 'auto')
		return console.error('--disable-fakemachine and --fakemachine-backend are mutually exclusive')

	// Set interactive shell binary only if '--debug-shell' options passed
	if (options.debugShell) {
		context.debugShell = options.shell
	}

	if (options.printRecipe) {
		context.printRecipe = options.printRecipe
	}

	if (options.verbose) {
		context.verbose = options.verbose
	}

	const file = path.resolve(...options._)
	const r = Parse(file, options.printRecipe, options.verbose, options.templateVars)

	/* If fakemachine is used the outer fake machine will never use the
		* scratchdir, so just set it to /scratch as a dummy to prevent the
		* outer debos creating a temporary directory */
	context.Scratchdir = '/scratch'

	let runInFakeMachine = true
	let m;
	if (options.disableFakeMachine || process.env.IN_FAKE_MACHINE) {
		runInFakeMachine = false
	} else {
		// attempt to create a fakemachine
		m = fakemachine.NewMachineWithBackend(options.backend)
		// fallback to running on the host unless the user has chosen a specific backend
		runInFakeMachine = false
		if (!m || options.backend != 'auto') return console.error('error creating fakemachine')
	}

	// if running on the host create a scratchdir
	if (!runInFakeMachine && !process.env.IN_FAKE_MACHINE) {
		console.warn('fakemachine not supported, running on the host!')
		context.Scratchdir = tmpdir('.debos-')		
	}

	context.Rootdir = path.join(context.Scratchdir, 'root')
	context.Image = options.internalImage
	context.RecipeDir = path.dirname(file)
	context.artifactDir = options.artifactDir
	if (!context.artifactDir) {
		context.artifactDir = path.resolve(process.cwd())
	}

	// Initialise origins map
	context.Origins = {
		artifacts: context.artifactDir,
		filesystem: context.Rootdir,
		recipe: context.RecipeDir
	}
	context.Architecture = r.Architecture
	context.State = debos.Success
	// Initialize environment variables map
	context.EnvironVars = {}
	// First add variables from host
	for (const key in environ_vars) {
		const lowerKey = key.toLowerCase() // lowercase not really needed
		const lowerVal = process.env[lowerKey]
		if (lowerVal) {
			context.EnvironVars[lowerVar] = lowerVal
		}
		const upperKey = key.toUpperCase()
		const upperVal = process.env[upperKey]
		if (upperVal) {
			context.EnvironVars[upperVar] = upperVal
		}

	}
	// Then add/overwrite with variables from command line
	options.EnvironVars = {...process.env}
	for (const [k, v] of Object.entries(options.EnvironVars)) {
		// Allows the user to unset environ variables with -e
		!v && delete context.EnvironVars[k]
		if (v) {
			context.EnvironVars[k] = v
		}
	}

	const everyAction = cb => r.Actions.map(action => cb(action))

	everyAction(action => action.Verify(context))

	if (options.dryRun) return console.log('==== Recipe done (Dry run) ====')
	if (runInFakeMachine) {
		const args = []
		m.SetMemory(options.memory)
		m.SetNumCPUs(options.cpus)
		options.scratchSize && m.SetScratch(options.scratchSize, "")
		m.SetShowBoot(options.showBoot)
		// Puts in a format that is compatible with output of os.Environ()
		const envsExist = Object.keys(context.EnvironVars).length
		envsExist && m.SetEnviron(Object.entries(context.EnvironVars)
			.filter(checkForHost).map(([k, v]) => `${k}="${v}"`).join('\n'))
		m.AddVolume(context.artifactDir)
		args.push('--artifactdir', context.artifactDir)
		for (const [k, v] of Object.entries(options.templateVars)) {
			args.push('--template-var', `${k}:"${v}"`)
		}
		for (const [k, v] of Object.entries(options.EnvironVars)) {
			args.push('--environ-var', `${k}:"${v}"`)
		}
		m.AddVolume(context.RecipeDir)
		args.push(file)
		options.debugShell && args.push('--debug-shell', '--shell', options.shell)
		everyAction(action => action.PreMachine(context, m, args))
		m.RunInMachineWithArgs(args)
		everyAction(action => action.PostMachine(context))
		return console.log('==== Recipe done ====')
	}

	!process.env.IN_FAKE_MACHINE && everyAction(action => action.PreNoMachine(context))

	// Create Rootdir
	!fs.existsSync(context.Rootdir) && fs.mkdirSync(context.Rootdir, { mode: 0o755 })
	everyAction(action => action.Run(context))
	!process.env.IN_FAKE_MACHINE &&
		everyAction(action => action.PostMachine(context)) && 
		console.log('==== Recipe done ====')

}
main()
