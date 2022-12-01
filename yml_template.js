import cp from 'child_process'
import YAML from 'yaml'

const valueOfVar = str => {
	if (str.startsWith('"') && str.endsWith('"')) return str.slice(1, -1)
	if (str.startsWith('(') && str.endsWith(')')) return cp.execSync(str.slice(1, -1)).toString()
}

const newKeyVal = ([key, val]) => [key, val.match(/or\s+\.(.*?)\s+(.*?)$/)?.slice(2)[0] || val]

const assign = text => {
	const [key, value] = newKeyVal(text.slice(1, -1).trim().match(/\$(.*?)\s+:=\s+(.*?)$/).slice(1))
	const env = process.env[key] || ''
	const val = (env || valueOfVar(value)).replace(/"/g, '\"')
	return {key, val}
}

function template(text, ymlVars={}) {
	const mapKeyVal = ({key, val}={}) => key && `${key}: "${ymlVars[key] = val}"`
	const checkVars = key => ymlVars[key] && `"${ymlVars[key]}"`

	const pattern = new RegExp('\{\{(.*?)\}\}', 'g')
	const yml = text.replace(pattern, (_, key) => {
		const equal = key.startsWith('-') && key.endsWith('-') && mapKeyVal(assign(key))
		return equal || checkVars(key.trim().slice(1)) || console.error('no_var:', key) || ''
	})
	return YAML.parse(yml)
}

export default template
