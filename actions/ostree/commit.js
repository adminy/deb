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
		Run: context => {
			// LogStart()
			const repoPath = path.join(context.artifactDir, Repository)		
			emptyDir(path.join(context.Rootdir, 'dev'))		
			const repo = otbuiltin.OpenRepo(repoPath)
			repo.PrepareTransaction()
			const opts = otbuiltin.NewCommitOptions()
			opts.Subject = ot.Subject
			for (const key in Metadata) {
				opts.AddMetadataString.push(`${key}=${Metadata[key]}`)
			}
			if (CollectionID) {
				opts.CollectionID = CollectionID
				// Add current branch if not explitely set via 'ref-binding'
				!RefBinding && opts.RefBinding.push(Branch)
			}
			// Add values from 'ref-binding' if any
			opts.RefBinding.push(...RefBinding)		
			const msg = repo.Commit(context.Rootdir, Branch, opts)
			console.log('Commit:', msg)
			repo.CommitTransaction()
		},
		PreNoMachine: () => {},
		PostMachine: () => {},
	}
}

export default OstreeCommitAction
