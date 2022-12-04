import fs from 'fs'
import yTemplate from '../yml_template.js'
import NewDebootstrapAction from './debootstrap.js'
import NewPackAction from './pack.js'
import UnpackAction from './unpack.js'
import RunAction from './run.js'
import NewAptAction from './apt.js'
import OstreeCommitAction from './ostree/commit.js'
import NewOstreeDeployAction from './ostree/deploy.js'
import OverlayAction from './overlay.js'
import ImagePartitionAction from './image_partition.js'
import NewFilesystemDeployAction from './filesystem_deploy.js'
import RawAction from './raw.js'
import DownloadAction from './download.js'
import RecipeAction from './recipe.js'

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
