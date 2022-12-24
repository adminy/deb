import path from 'path'
import fs from 'fs'

// github.com/sjoerdsimons/ostree-go/pkg/otbuiltin
function OstreeCommitAction({
	Repository, Branch, Subject, Command,
	CollectionID, //yml['collection-id']
	RefBinding, // yml['ref-binding']
	Metadata,
	LogStart
}) {
	const emptyDir = dir => fs.readdirSync(dir).map(file => fs.unlinkSync(path.join(dir, file)))
	return {
		emptyDir,
		run: context => {
			// LogStart()
			const repoPath = path.join(context.artifactDir, Repository)		
			emptyDir(path.join(context.rootdir, 'dev'))		
			const repo = otbuiltin.openRepo(repoPath)
			repo.prepareTransaction()
			const opts = otbuiltin.newCommitOptions()
			opts.subject = ot.subject
			for (const key in Metadata) {
				opts.addMetadataString.push(`${key}=${Metadata[key]}`)
			}
			if (CollectionID) {
				opts.collectionID = CollectionID
				// Add current branch if not explitely set via 'ref-binding'
				!RefBinding && opts.refBinding.push(Branch)
			}
			// Add values from 'ref-binding' if any
			opts.refBinding.push(...refBinding)		
			const msg = repo.commit(context.rootdir, Branch, opts)
			console.log('Commit:', msg)
			repo.commitTransaction()
		},
		preNoMachine: () => {},
		postMachine: () => {},
	}
}

export default OstreeCommitAction
