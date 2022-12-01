import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import path from 'path'
import fs from 'fs'
import {tmpdir} from 'os'
import debos from './debos.js'
import Parse from './actions/recipe.js'

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
	.option('Backend', {
		aliases: ['-fakemachine-backend', 'b'],
		describe: 'Fakemachine backend to use',
		choices: ['kvm', 'qemu', 'uml', 'auto'],
		default: 'auto'
	})
	.option('ArtifactDir', { alias: '-artifactdir', describe: 'Directory for packed archives and ostree repositories', default: process.cwd()})
	.option('InternalImage', {alias: '-internal-image', hidden: true})
	.option('TemplateVars', {aliases: ['t', '-template-var'], describe: 'Template variables (use -t VARIABLE:VALUE syntax)'}).array()
	.option('DebugShell', {alias: '-debug-shell', describe: 'Fall into interactive shell on error', default: false}).boolean()
	.option('Shell', {aliases: ['s', '-shell'], describe: 'Redefine interactive shell binary', default: '/bin/bash'})
	.option('ScratchSize', {alias: ['-scratchsize'], describe: 'Size of disk backed scratch space'}).number()
	.option('CPUs', {aliases: ['c', '-cpus'], describe: 'Number of CPUs to use for build VM', default: 2}).number()
	.option('Memory', {aliases: ['m', '-memory'], describe: 'Amount of memory for build VM in Megabytes (MB)', default: 2 * 1024}).number()
	.option('ShowBoot', {alias: '-show-boot', describe: 'Show boot/console messages from the fake machine'}).boolean()
	.option('EnvironVars', {aliases: ['e', '-environ-var'], describe: 'Environment variables (use -e VARIABLE:VALUE syntax)'}).array()
	.option('Verbose', {aliases: ['v', '-verbose'], describe: 'Verbose output', default: true}).boolean()
	.option('PrintRecipe', {alias: '-print-recipe', describe: 'Print final recipe', default: false}).boolean()
	.option('DryRun', {alias: '-dry-run', describe: 'Compose final recipe to build but without any real work started', default: false}).boolean()
	.option('DisableFakeMachine', {alias: '-disable-fakemachine', describe: 'Do not use fakemachine.', default: true}).boolean()
	.argv
const context = {}

// These are the environment variables that will be detected on the
// host and propagated to fakemachine. These are listed lower case, but
// they are detected and configured in both lower case and upper case.
const environ_vars = [ 'http_proxy', 'https_proxy', 'ftp_proxy', 'rsync_proxy', 'all_proxy', 'no_proxy' ]

const main = () => {

	if (!options._.length) return console.error('No recipe given!')

	if (options.DisableFakeMachine && options.Backend != 'auto')
		return console.error('--disable-fakemachine and --fakemachine-backend are mutually exclusive')

	// Set interactive shell binary only if '--debug-shell' options passed
	if (options.DebugShell) {
		context.DebugShell = options.Shell
	}

	if (options.PrintRecipe) {
		context.PrintRecipe = options.PrintRecipe
	}

	if (options.Verbose) {
		context.Verbose = options.Verbose
	}

	const file = path.resolve(...options._)
	const r = Parse(file, options.PrintRecipe, options.Verbose, options.TemplateVars)

	/* If fakemachine is used the outer fake machine will never use the
		* scratchdir, so just set it to /scratch as a dummy to prevent the
		* outer debos creating a temporary directory */
	context.Scratchdir = '/scratch'

	let runInFakeMachine = true
	let m;
	if (options.DisableFakeMachine || process.env.IN_FAKE_MACHINE) {
		runInFakeMachine = false
	} else {
		// attempt to create a fakemachine
		m = fakemachine.NewMachineWithBackend(options.Backend)
		// fallback to running on the host unless the user has chosen a specific backend
		runInFakeMachine = false
		if (!m || options.Backend != 'auto') return console.error('error creating fakemachine')
	}

	// if running on the host create a scratchdir
	if (!runInFakeMachine && !process.env.IN_FAKE_MACHINE) {
		console.warn('fakemachine not supported, running on the host!')
		context.Scratchdir = tmpdir('.debos-')		
	}

	context.Rootdir = path.join(context.Scratchdir, 'root')
	context.Image = options.InternalImage
	context.RecipeDir = path.dirname(file)
	context.Artifactdir = options.ArtifactDir
	if (!context.Artifactdir) {
		context.Artifactdir = path.resolve(process.cwd())
	}

	// Initialise origins map
	context.Origins = {
		artifacts: context.Artifactdir,
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

	if (options.DryRun) return console.log('==== Recipe done (Dry run) ====')
	if (runInFakeMachine) {
		const args = []
		m.SetMemory(options.Memory)
		m.SetNumCPUs(options.CPUs)
		options.ScratchSize && m.SetScratch(options.ScratchSize, "")
		m.SetShowBoot(options.ShowBoot)
		// Puts in a format that is compatible with output of os.Environ()
		const envsExist = Object.keys(context.EnvironVars).length
		envsExist && m.SetEnviron(Object.entries(context.EnvironVars)
			.filter(checkForHost).map(([k, v]) => `${k}="${v}"`).join('\n'))
		m.AddVolume(context.Artifactdir)
		args.push('--artifactdir', context.Artifactdir)
		for (const [k, v] of Object.entries(options.TemplateVars)) {
			args.push('--template-var', `${k}:"${v}"`)
		}
		for (const [k, v] of Object.entries(options.EnvironVars)) {
			args.push('--environ-var', `${k}:"${v}"`)
		}
		m.AddVolume(context.RecipeDir)
		args.push(file)
		options.DebugShell && args.push('--debug-shell', '--shell', options.Shell)
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
