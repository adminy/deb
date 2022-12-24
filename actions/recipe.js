import path from 'path'
import Parse from './index.js'
export default recipe => {
	var {recipe, variables} = recipe
	return {
		verify: context => {
			if (!recipe) return console.error('"recipe" property can\'t be empty')
			let file = recipe
			file = path.join(context.recipeDir, recipe)
			context.recipeDir = path.dirname(file)

			// Initialise template vars
			const templateVars = {}
			templateVars.architecture = context.architecture


			recipe = {...Parse(file, context.printRecipe, context.verbose, templateVars), ...recipe}
			
			recipe.context = context
			recipe.templateVars = templateVars

			// Add Variables to template vars
			for (const key in variables) {
				templateVars[key] = variables[key]
			}


			if (context.architecture != recipe.architecture)
				return console.error('Expect architecture', context.architecture, 'but got', recipe.architecture)

			recipe.actions.map(action => action.verify ? action.verify(context) : console.error('receipe action does not contain "verify" method', action))
		},
		preMachine: (context, m, args) => {
			// TODO: check args?
			m.addVolume(context.recipeDir)
			recipe.actions.map(action => action.preMachine(context, m, args))
		},
		preNoMachine: context => recipe.actions.map(action => action.preNoMachine(context)),
		run: context => {
			// LogStart()
			recipe.actions.map(action => action.run(context))
		},
		cleanup: context => recipe.actions.map(action => action.cleanup(context)),
		postMachine: context => recipe.actions.map(action => action.postMachine(context)),
		postMachineCleanup: context => recipe.actions.map(action => action.postMachineCleanup(context))
	}
}
