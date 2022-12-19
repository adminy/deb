import fs from 'fs'
import path from 'path'

export default function NewFilesystemDeployAction({
	SetupFSTab=true, // yml['setup-fstab']
	SetupKernelCmdline=true, // yml['setup-kernel-cmdline']
	AppendKernelCmdline, //yml['append-kernel-cmdline']
	Description='Deploying filesystem',
	LogStart
}) {
	const setupFSTab = context => {
		if (!context.ImageFSTab) return console.error('Fstab not generated, missing image-partition action?')
		console.log('Setting up fstab')
		fs.mkdirSync(path.join(context.Rootdir, 'etc'), {mode: 0o755})
		const fstab = path.join(context.Rootdir, 'etc', 'fstab')
		fs.writeFileSync(fstab, context.ImageFSTab)
	}
	const setupKernelCmdline = context => {
		console.log('Setting up /etc/kernel/cmdline')
		const kernelDir = path.join(context.Rootdir, 'etc', 'kernel')
		fs.mkdirSync(kernelDir, {mode: 0o755})
		const cmdlineFile = fs.readdirSync(path.join(kernelDir, 'cmdline')).toString().trim()
		const cmdline = `${cmdlineFile} ${context.ImageKernelRoot} ${AppendKernelCmdline || ''}`
		fs.writeFileSync(path.join(kernelDir, 'cmdline'), cmdline)
	}
	return {
		setupFSTab,
        setupKernelCmdline,
		Run: context => {
			// LogStart()
			// Copying files is actually silly hafd, one has to keep permissions, ACL's
			// extended attribute, misc, other. Leave it to cp...
			debos.Command.Run('Deploy to image', 'cp', '-a', context.Rootdir+'/.', context.ImageMntDir)
			context.Rootdir = context.ImageMntDir
			context.Origins.filesystem = context.ImageMntDir
			SetupFSTab && setupFSTab(context)
			SetupKernelCmdline && setupKernelCmdline(context)
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}
}
