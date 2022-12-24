
import path from 'path'

const maxLabelLength = 40
export default ({Chroot, PostProcess, Script, Command, Label, LogStart}) => {
	const doRun = context => {
		// LogStart()
		const cmdline = []
		const cmd = Chroot ? debos.newChrootCommandForContext(context) : debos.command
		let label = ''
		if (Script) {
			const script = Script.split(' ').slice(0, 2)
			script[0] = path.resolve(context.recipeDir, script[0])
			if (Chroot) {
				const scriptpath = path.dirname(script[0])
				cmd.addBindMount(scriptpath, '/tmp/script')
				script[0] = strings.replace(script[0], scriptpath, '/tmp/script', 1)
			}
			cmdline.push(script.join(' '))
			label = path.basename(Script)
		} else {
			cmdline = Command
			// Remove leading and trailing spaces and — importantly — newlines
			// before splitting, so that single-line scripts split into an array
			// of a single string only.
			const commands = Command.trim().split('\n')
			label = commands[0]
			// Make it clear a long or a multi-line command is being run
			if (label.length > maxLabelLength) {
				label = label.substring(0, maxLabelLength).trim() + '...'
			} else if (commands.length > 1) label += '...'
		}
		if (Label) { label = Label }

		// Command/script with options passed as single string
		cmdline.push('sh', '-c', ...cmdline)
		if (!Chroot) {
			cmd.addEnvKey('RECIPEDIR', context.recipeDir)
			cmd.addEnvKey('ARTIFACTDIR', context.artifactDir)
		}
		if (!PostProcess) {
			if (!Chroot) {
				cmd.addEnvKey("ROOTDIR", context.rootdir)
				context.imageMntDir && cmd.addEnvKey("IMAGEMNTDIR", context.imageMntDir)
			}
			context.image && cmd.addEnvKey("IMAGE", context.image)
		}
		return cmd.run(label, ...cmdline)
	}
	return {
		verify: () => {
			if (PostProcess && Chroot) return console.error("Cannot run postprocessing in the chroot")
			if (!Script && !Command) return console.error('Script and Command both cannot be empty')
		},
		preMachine: context => {
			if (!Script) return
			const args = []		
			debos.cleanPathAt(Script, context.recipeDir)
			// Expect we have no blank spaces in path
			const [scriptpath] = Script.split(' ')
			!PostProcess && m.addVolume(path.dirname(scriptpath))		
		},
		doRun,
		// This runs in postprocessing instead 
		run: context => !PostProcess && doRun(context),
		postMachine: context => !PostProcess && doRun(context)
	}
}
