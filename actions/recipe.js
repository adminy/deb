import fs from 'fs'
import yTemplate from '../yml_template.js'
import NewDebootstrapAction from './debootstrap.js'
import NewPackAction from './empty.js'
import UnpackAction from './empty.js'
import RunAction from './empty.js'
import NewAptAction from './empty.js'
import OstreeCommitAction from './empty.js'
import NewOstreeDeployAction from './empty.js'
import OverlayAction from './empty.js'
import ImagePartitionAction from './empty.js'
import NewFilesystemDeployAction from './empty.js'
import RawAction from './empty.js'
import DownloadAction from './empty.js'
import RecipeAction from './empty.js'

const todo = {
	debootstrap: NewDebootstrapAction,
	pack: NewPackAction,
	unpack: UnpackAction,
	run: RunAction,
	apt: NewAptAction,
	'ostree-commit': OstreeCommitAction,
	'ostree-deploy': NewOstreeDeployAction,
	overlay: OverlayAction,
	'image-partition': ImagePartitionAction,
	'filesystem-deploy': NewFilesystemDeployAction,
	raw: RawAction,
	download: DownloadAction,
	recipe: RecipeAction
}

function Parse(file, printRecipe, dump, templateVars) {
	const data = fs.readFileSync(file).toString()
	const {architecture, actions} = yTemplate(data, {sector: s => s * 512, ...templateVars})
	if (printRecipe || dump) console.log(`Recipe '${file}':`)
	printRecipe && console.log(data)
	dump && console.log(architecture, actions)
	if (!architecture) return console.error('Recipe file must have "architecture" property')
	if (!actions) return console.error('Recipe file must have at least one action')
	return {
		Actions: actions.map(entry => todo[entry.action]?.(entry) || console.error('Unknown action:', entry)),
		Architecture: architecture
	}
}

export default Parse
