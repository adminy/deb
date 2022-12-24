import fs from 'fs'
import path from 'path'

export default function NewFilesystemDeployAction({
	setupFSTab=true, // yml['setup-fstab']
	setupKernelCmdline=true, // yml['setup-kernel-cmdline']
	appendKernelCmdline, //yml['append-kernel-cmdline']
	description='Deploying filesystem',
	logStart
}) {
	const setupFSTabFn = context => {
		if (!context.imageFSTab) return console.error('Fstab not generated, missing image-partition action?')
		console.log('Setting up fstab')
		fs.mkdirSync(path.join(context.rootdir, 'etc'), {mode: 0o755})
		const fstab = path.join(context.rootdir, 'etc', 'fstab')
		fs.writeFileSync(fstab, context.imageFSTab)
	}
	const setupKernelCmdlineFn = context => {
		console.log('Setting up /etc/kernel/cmdline')
		const kernelDir = path.join(context.rootdir, 'etc', 'kernel')
		fs.mkdirSync(kernelDir, {mode: 0o755})
		const cmdlineFile = fs.readdirSync(path.join(kernelDir, 'cmdline')).toString().trim()
		const cmdline = `${cmdlineFile} ${context.imageKernelRoot} ${appendKernelCmdline || ''}`
		fs.writeFileSync(path.join(kernelDir, 'cmdline'), cmdline)
	}
	return {
		setupFSTab: setupFSTabFn,
        setupKernelCmdline: setupKernelCmdlineFn,
		run: context => {
			// logStart()
			// Copying files is actually silly hafd, one has to keep permissions, ACL's
			// extended attribute, misc, other. Leave it to cp...
			debos.command.run('Deploy to image', 'cp', '-a', context.rootdir+'/.', context.imageMntDir)
			context.rootdir = context.imageMntDir
			context.origins.filesystem = context.imageMntDir
			setupFSTab && setupFSTabFn(context)
			setupKernelCmdline && setupKernelCmdlineFn(context)
		},
		preNoMachine: () => {},
		postMachine: () => {},
		verify: () => {},
	}
}
