
import path from 'path'

const maxLabelLength = 40
export default ({Chroot, PostProcess, Script, Command, Label, LogStart}) => {
	const doRun = context => {
		// LogStart()
		const cmdline = []
		const cmd = Chroot ? debos.NewChrootCommandForContext(context) : debos.Command
		let label = ''
		if (Script) {
			const script = Script.split(' ').slice(0, 2)
			script[0] = path.resolve(context.RecipeDir, script[0])
			if (Chroot) {
				const scriptpath = path.dirname(script[0])
				cmd.AddBindMount(scriptpath, '/tmp/script')
				script[0] = strings.Replace(script[0], scriptpath, '/tmp/script', 1)
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
			cmd.AddEnvKey('RECIPEDIR', context.RecipeDir)
			cmd.AddEnvKey('ARTIFACTDIR', context.artifactDir)
		}
		if (!PostProcess) {
			if (!Chroot) {
				cmd.AddEnvKey("ROOTDIR", context.Rootdir)
				context.ImageMntDir && cmd.AddEnvKey("IMAGEMNTDIR", context.ImageMntDir)
			}
			context.Image && cmd.AddEnvKey("IMAGE", context.Image)
		}
		return cmd.Run(label, ...cmdline)
	}
	return {
		Verify: () => {
			if (PostProcess && Chroot) return console.error("Cannot run postprocessing in the chroot")
			if (!Script && !Command) return console.error('Script and Command both cannot be empty')
		},
		PreMachine: context => {
			if (!Script) return
			const args = []		
			debos.CleanPathAt(Script, context.RecipeDir)
			// Expect we have no blank spaces in path
			const [scriptpath] = Script.split(' ')
			!PostProcess && m.AddVolume(path.dirname(scriptpath))		
		},
		doRun,
		// This runs in postprocessing instead 
		Run: context => !PostProcess && doRun(context),
		PostMachine: context => !PostProcess && doRun(context)
	}
}
