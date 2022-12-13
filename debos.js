import NewChrootCommandForContext from './commands'
export default {
	Success: 1,
	Failure: 0,
	Command: NewChrootCommandForContext({}), // context is in index.js
	NewChrootCommandForContext
}
