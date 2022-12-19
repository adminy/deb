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
		const deploymentDir = `ostree/deploy/${deployment.Osname()}/deploy/${deployment.Csum()}.${deployment.Deployserial()}`
		const etcDir = path.join(context.Rootdir, deploymentDir, 'etc')
		fs.mkdirSync(etcDir, {mode: 0o755})
		fs.writeFileSync(path.join(etcDir, 'fstab'), context.ImageFSTab)
	}

	return {
		setupFSTab,
		Run: context => {
			// LogStart()

			// This is to handle cases there we didn't partition an image
			if (context.ImageMntDir) {
				// First deploy the current rootdir to the image so it can seed e.g. bootloader configuration
				debos.Command.Run('Deploy to image', 'cp', '-a', context.Rootdir+'/.', context.ImageMntDir)
				context.Rootdir = context.ImageMntDir
				context.Origins.filesystem = context.ImageMntDir
			}
			const repoPath = 'file://' + path.join(context.artifactDir, Repository)
			const sysroot = ostree.NewSysroot(context.Rootdir)
			sysroot.InitializeFS()
			sysroot.InitOsname(ot.Os, nil)
			// HACK: Getting the repository form the sysroot gets ostree confused on whether
			// it should configure /etc/ostree or the repo configuration, so reopen by hand
			// const dstRepo = sysroot.Repo(nil)
			const dstRepo = ostree.OpenRepo(path.join(context.Rootdir, 'ostree/repo'))
			// FIXME: add support for gpg signing commits so this is no longer needed
			const opts = ostree.RemoteOptions = {
				NoGpgVerify: true,
				TlsClientCertPath: TlsClientCertPath,
				TlsClientKeyPath:  TlsClientKeyPath,
				CollectionId:      CollectionID,
			}
			dstRepo.RemoteAdd('origin', ot.RemoteRepository, opts)
			const options = ostree.PullOptions
			options.OverrideRemoteName = 'origin'
			options.Refs = Branch

			dstRepo.PullWithOptions(repoPath, options)
			// Required by ostree to make sure a bunch of information was pulled in
			sysroot.Load()
			revision = dstRepo.ResolveRev(ot.Branch, false)
			const kargs = []
			SetupKernelCmdline && kargs.push(context.ImageKernelRoot)

			AppendKernelCmdline && kargs.push(...AppendKernelCmdline.split(' '))

			const origin = sysroot.OriginNewFromRefspec('origin:' + Branch)
			const deployment = sysroot.DeployTree(ot.Os, revision, origin, null, kargs)

			SetupFSTab && setupFSTab(deployment, context)
		
			sysroot.SimpleWriteDeployment(ot.Os, deployment, null, 0)
			/* libostree keeps some information, like repo lock file descriptor, in
			* thread specific variables. As GC can be run from another thread, it
			* may not been able to access this, preventing to free them correctly.
			* To prevent this, explicitly dereference libostree objects. */
			dstRepo.Unref()
			sysroot.Unref()
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}
}

export default OstreeDeployAction
