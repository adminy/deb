import path from 'path'
import fs from 'fs'

// ostree "github.com/sjoerdsimons/ostree-go/pkg/otbuiltin"

function OstreeDeployAction({
	Repository,
	RemoteRepository, // "remote_repository"
	Branch, Os,
	SetupFSTab=true, //yml['setup-fstab']
	SetupKernelCmdline=true, //yml['setup-kernel-cmdline']
	AppendKernelCmdline, //yml['append-kernel-cmdline']
	TlsClientCertPath, //yml['tls-client-cert-path']
	TlsClientKeyPath, //yml['tls-client-key-path']
	CollectionID, //yml['collection-id']
	Description='Deploying from ostree',
	LogStart
}) {

	const setupFSTab = (deployment, context)  => {
		const deploymentDir = `ostree/deploy/${deployment.osname()}/deploy/${deployment.csum()}.${deployment.deployserial()}`
		const etcDir = path.join(context.rootdir, deploymentDir, 'etc')
		fs.mkdirSync(etcDir, {mode: 0o755})
		fs.writeFileSync(path.join(etcDir, 'fstab'), context.imageFSTab)
	}

	return {
		setupFSTab,
		run: context => {
			// LogStart()

			// This is to handle cases there we didn't partition an image
			if (context.imageMntDir) {
				// First deploy the current rootdir to the image so it can seed e.g. bootloader configuration
				debos.command.run('Deploy to image', 'cp', '-a', context.rootdir+'/.', context.imageMntDir)
				context.rootdir = context.imageMntDir
				context.origins.filesystem = context.imageMntDir
			}
			const repoPath = 'file://' + path.join(context.artifactDir, Repository)
			const sysroot = ostree.newSysroot(context.rootdir)
			sysroot.initializeFS()
			sysroot.initOsname(ot.os, nil)
			// HACK: Getting the repository form the sysroot gets ostree confused on whether
			// it should configure /etc/ostree or the repo configuration, so reopen by hand
			// const dstRepo = sysroot.repo(nil)
			const dstRepo = ostree.openRepo(path.join(context.rootdir, 'ostree/repo'))
			// FIXME: add support for gpg signing commits so this is no longer needed
			const opts = ostree.remoteOptions = {
				NoGpgverify: true,
				TlsClientCertPath: TlsClientCertPath,
				TlsClientKeyPath:  TlsClientKeyPath,
				CollectionId:      CollectionID,
			}
			dstRepo.remoteAdd('origin', ot.remoteRepository, opts)
			const options = ostree.pullOptions
			options.overrideRemoteName = 'origin'
			options.refs = Branch

			dstRepo.pullWithOptions(repoPath, options)
			// Required by ostree to make sure a bunch of information was pulled in
			sysroot.load()
			revision = dstRepo.resolveRev(ot.branch, false)
			const kargs = []
			SetupKernelCmdline && kargs.push(context.imageKernelRoot)

			AppendKernelCmdline && kargs.push(...appendKernelCmdline.split(' '))

			const origin = sysroot.originNewFromRefspec('origin:' + Branch)
			const deployment = sysroot.deployTree(ot.os, revision, origin, null, kargs)

			SetupFSTab && setupFSTab(deployment, context)
		
			sysroot.simpleWriteDeployment(ot.os, deployment, null, 0)
			/* libostree keeps some information, like repo lock file descriptor, in
			* thread specific variables. As GC can be run from another thread, it
			* may not been able to access this, preventing to free them correctly.
			* To prevent this, explicitly dereference libostree objects. */
			dstRepo.unref()
			sysroot.unref()
		},
		preNoMachine: () => {},
		postMachine: () => {},
	}
}

export default OstreeDeployAction
