import path from 'path'
import Parse from './index.js'
export default recipe => {
	var {recipe, Variables, Actions, templateVars, LogStart} = recipe
	return {
		Verify: context => {
			if (!recipe) return console.error('"recipe" property can\'t be empty')
			// recipe.context = context
			let file = recipe
			console.log('file', file, 'what about the main file?') // TODO ...
			if (path.isAbsolute(file)) {
				file = path.join(context.recipeDir, recipe)
			}
			context.recipeDir = path.dirname(file)

			// Initialise template vars
			// recipe.templateVars = {}
			// recipe.templateVars.architecture = context.Architecture
		
			// Add Variables to template vars
			for (const key in Variables) {
				templateVars[key] = Variables[key]
			}

			Parse(file, context.printRecipe, context.verbose, templateVars)
		
			if (context.Architecture != Actions.Architecture)
				return console.error('Expect architecture', context.Architecture, 'but got', Actions.Architecture)

			Actions.Actions.map(action => action.Verify(context))
		},
		PreMachine: (context, m, args) => {
			// TODO: check args?
			m.AddVolume(context.recipeDir)
			Actions.Actions.map(action => action.PreMachine(context, m, args))
		},
		PreNoMachine: context => Actions.Actions.map(action => action.PreNoMachine(context)),
		Run: context => {
			// LogStart()
			Actions.Actions.map(action => action.Run(context))
		},
		Cleanup: context => Actions.Actions.map(action => action.Cleanup(context)),
		PostMachine: context => Actions.Actions.map(action => action.PostMachine(context)),
		PostMachineCleanup: context => Actions.Actions.map(action => action.PostMachineCleanup(context))
	}
}
