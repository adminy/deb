import newChroot from './commands.js'

const debos = {
	Success: 1,
	Failure: 0,
	NewChrootCommandForContext: (...args) => {
		return debos.Command = newChroot(...args)
	}
}

export default debos
