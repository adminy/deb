export default function AptAction({Recommends, Unauthenticated, Update=true, Packages, LogStart}) {
	return {
		Run: context => {
			// LogStart()
			const aptOptions = ['apt-get', '-y']		
			!Recommends && aptOptions.push('--no-install-recommends')		
			Unauthenticated && aptOptions.push('--allow-unauthenticated')		
			aptOptions.push('install', ...apt.Packages)
			const c = debos.NewChrootCommandForContext(context)
			c.AddEnv('DEBIAN_FRONTEND=noninteractive')		
			Update && c.Run('apt', 'apt-get', 'update')
			c.Run('apt', ...aptOptions)
			c.Run('apt', 'apt-get', 'clean')
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}
}
