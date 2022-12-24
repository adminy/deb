import newChroot from './commands.js'

const debos = {
	success: 1,
	failure: 0,
	newChrootCommandForContext: (...args) => {
		return debos.command = newChroot(...args)
	}
}

export default debos
