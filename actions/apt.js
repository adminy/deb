export default function AptAction({Recommends, Unauthenticated, Update=true, Packages, LogStart}) {
	return {
		run: context => {
			// LogStart()
			const aptOptions = ['apt-get', '-y']		
			!Recommends && aptOptions.push('--no-install-recommends')		
			Unauthenticated && aptOptions.push('--allow-unauthenticated')		
			aptOptions.push('install', ...apt.packages)
			const c = debos.newChrootCommandForContext(context)
			c.addEnv('DEBIAN_FRONTEND=noninteractive')		
			Update && c.run('apt', 'apt-get', 'update')
			c.run('apt', ...aptOptions)
			c.run('apt', 'apt-get', 'clean')
		},
		preNoMachine: () => {},
		postMachine: () => {},
		verify: () => {},
	}
}
