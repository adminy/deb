import fs from 'fs'
import path from 'path'
// "github.com/docker/go-units"
// "github.com/go-debos/fakemachine"
// "github.com/google/uuid"
// "gopkg.in/freddierice/go-losetup.v1"

export default function ImagePartitionAction(imgPart) {
	const {
		ImageName, ImageSize, PartitionType, DiskID, GptGap /** gpt_gap */,  Partitions /** mkPart() */, Mountpoints /** mkMountPoint */, size, loopDev, usingLoop, LogStart
	} = imgPart
	const {	number, flags } = loopDev || {}

	const lockImage = context => {
		fd = os.Open(context.Image)
		syscall.Flock(fd, syscall.LOCK_EX)
		return {unlock: () => fd.Close()}
	}
	const mkPart = ({ number, Name, PartLabel, PartType, PartUUID, Start, End, FS, Flags, Features, ExtendedOptions, Fsck /** fsck */, FSUUID }) => {}
	const mkMountPoint = ({ Mountpoint, Partition, Options, Buildtime, part /** mkPart */ }) => {}

	const UnmarshalYAML = unmarshal => {
		const part = mkPart({Fsck: true})
		unmarshal(part)
		return Partition(part)
	}

	const generateFSTab = context => {
		context.ImageFSTab.Reset()
		for (const m of Mountpoints) {
			const options = ['defaults', ...m.Options]
			if (m.Buildtime) continue // Do not need to add mount point into fstab
			if (!m.part.FSUUID) return console.error('Missing fs UUID for partition', m.part.Name)
			let fs_passno = 0
			if (m.part.Fsck) {
				fs_passno = m.Mountpoint === '/' ? 1 : 2
			}
			context.ImageFSTab.WriteString(`UUID=${m.part.FSUUID}\t${m.Mountpoint}\t${m.part.FS}\t${options.join(',')}\t0\t${fs_passno}\n`)
		}
    }

	const generateKernelRoot = context => {
		for (const m of Mountpoints.filter(m => m.Mountpoint === '/')) {
			if (!m.part.FSUUID) return console.error('No fs UUID for root partition !?!')
			context.ImageKernelRoot = 'root=UUID=' + m.part.FSUUID
			break
		}
	}

	const getPartitionDevice = (number, context) => {
		// Always look up canonical device as udev might not generate the by-id
		// symlinks while there is an flock on /dev/vda
		const device = fs.realpathSync(context.Image)
		const suffix = 'p'
		// Check partition naming first: if used 'by-id'i naming convention
		if (device.includes('/disk/by-id/')) { suffix = '-part' }
	
		// If the iamge device has a digit as the last character, the partition
		// suffix is p<number> else it's just <number>
		const last = parseInt(device[device.length - 1], 10)
		return last >= 0 && last <= 9 ? device + suffix + number : device + number
	}

	const triggerDeviceNodes = context => debos.Command.Run(
		'udevadm', 'udevadm', 'trigger', '--settle', context.Image
	)

	const PreMachine = (context, m, args) => {
		const imagePath = path.join(context.artifactDir, ImageName)
		const image = m.CreateImage(imagePath, size)
		context.Image = image
		args.push('--internal-image', image)
	}

	const formatPartition = (p, context) => {
		const label = 'Formatting partition ' + p.number
		const path = getPartitionDevice(p.number, context)
		const cmdline = []
		const typeOfPartition = {
			vfat: () => {
				cmdline.push('mkfs.vfat', '-F32', '-n', p.Name)
				p.FSUUID && cmdline.push('-i', p.FSUUID)
			},
			btrfs: () => {
				// Force formatting to prevent failure in case if partition was formatted already
				cmdline.push('mkfs.btrfs', '-L', p.Name, '-f')
				p.Features.length && cmdline.push('-O', p.Features.join(','))
				p.FSUUID && cmdline.push('-U', p.FSUUID)
			},
			f2fs: () => {
				cmdline.push('mkfs.f2fs', '-l', p.Name)
				p.Features.length && cmdline.push('-O', p.Features.join(','))
			},
			hfs: () => cmdline.push('mkfs.hfs', '-h', '-v', p.Name),
			hfsplus: () => cmdline.push('mkfs.hfsplus', '-v', p.Name),
			hfsx: () => {
				cmdline.push('mkfs.hfsplus', '-s', '-v', p.Name),
				// hfsx is case-insensitive hfs+, should be treated as "normal" hfs+ from now on
				p.FS = 'hfsplus'
			},
			xfs: () => {
				cmdline.push('mkfs.xfs', '-L', p.Name)
				p.FSUUID && cmdline.push('-m', 'uuid=' + p.FSUUID)
			},
			none: () => {
				cmdline.push('mkfs.' + p.FS, '-L', p.Name)
				p.Features.length && cmdline.push('-O', p.Features.join(','))
				p.ExtendedOptions.length && cmdline.push('-E', p.ExtendedOptions.join(','))
				p.FSUUID && ['ext2', 'ext3', 'ext4'].includes(p.FS) && cmdline.push('-U', p.FSUUID)
			}
		}
		typeOfPartition[p.FS]?.() || typeOfPartition.none()
		if (cmdline.length) {
			cmdline.push(path)
		}
		const cmd = debos.Command
		/* Some underlying device driver, e.g. the UML UBD driver, may manage holes
		 * incorrectly which will prevent to retrieve all useful zero ranges in
		 * filesystem, e.g. when using 'bmaptool create', see patch
		 * http://lists.infradead.org/pipermail/linux-um/2022-January/002074.html
		 *
		 * Adding UNIX_IO_NOZEROOUT environment variable prevent mkfs.ext[234]
		 * utilities to create zero range spaces using fallocate with
		 * FALLOC_FL_ZERO_RANGE or FALLOC_FL_PUNCH_HOLE */
		['ext2', 'ext3', 'ext4'].includes(p.FS) && cmd.AddEnv('UNIX_IO_NOZEROOUT=1')
		cmd.Run(label, ...cmdline)
		if (p.FS !== 'none' && !p.FSUUID) {
			p.FSUUID = exec.Command('blkid', '-o', 'value', '-s', 'UUID', '-p', '-c', 'none', path).Output().trim()
		}
	}

	const PreNoMachine = context => {
		const imagePath = path.join(context.artifactDir, ImageName)
		const img = os.OpenFile(imagePath, os.O_WRONLY|os.O_CREATE, 0o666)
		img.Truncate(i.size) // resize
		img.Close()
		imgPart.loopDev = losetup.Attach(imagePath, 0, false)
		context.Image = loopDev.Path()
		imgPart.usingLoop = true
	}

	const Run = context => {
		// LogStart()
	
		/* On certain disk device events udev will call the BLKRRPART ioctl to
		 * re-read the partition table. This will cause the partition devices
		 * (e.g. vda3) to temporarily disappear while the rescanning happens.
		 * udev does this while holding an exclusive flock. This means to avoid partition
		 * devices disappearing while doing operations on them (e.g. formatting
		 * and mounting) we need to do it while holding an exclusive lock
		 */
		const command = ['parted', '-s', context.Image, 'mklabel', PartitionType]
		GptGap && command.push(GptGap)
		debos.Command.Run('parted', ...command)
		DiskID && debos.Command.Run('sfdisk', ...['sfdisk', '--disk-id', context.Image, DiskID])
	
		for (let idx = 0; idx < Partitions.length; idx++) {
			const p = Partitions[idx]
	
			if (!p.PartLabel) {
				p.PartLabel = p.Name
			}

			const name = PartitionType === 'gpt' ? p.PartLabel : 'primary'
	
			const fsType = p.FS === 'vfat' ? 'fat32' : p.FS === 'hfsplus' ? 'hfs+' : p.FS
			debos.Command.Run('parted', 'parted', '-a', 'none', '-s', '--', context.Image, 'mkpart', name, fsType, p.Start, p.End)
			p.Flags.map(flag => debos.Command.Run('parted', 'parted', '-s', context.Image, 'set', p.number, flag, 'on'))
			p.PartType && debos.Command.Run('sfdisk', 'sfdisk', '--part-type', context.Image, p.number, p.PartType)			
			// PartUUID will only be set for gpt partitions
			p.PartUUID && debos.Command.Run('sfdisk', 'sfdisk', '--part-uuid', context.Image, p.number, p.PartUUID)
			const lock = lockImage(context)
			formatPartition(p, context)
			lock.unlock()	
			const devicePath = getPartitionDevice(p.number, context)
			context.ImagePartitions.push(debos.Partition(p.Name, devicePath))
		}		
		context.ImageMntDir = path.join(context.Scratchdir, 'mnt')
		fs.mkdirSync(context.ImageMntDir, {mode: 0o755})
	
		// sort mountpoints based on position in filesystem hierarchy
		Mountpoints.sort((a, b) => {
			const mntA = a.Mountpoint
			const mntB = b.Mountpoint
			// root should always be mounted first
			if (mntA === '/') return true
			if (mntB === '/') return false
			return mntA.split('/').length < mntB.split('/').length
		})
		const lock = lockImage(context)
		for (const m of Mountpoints) {
			const dev = getPartitionDevice(m.part.number, context)
			const mntpath = path.join(context.ImageMntDir, m.Mountpoint)
			fs.mkdirSync(mntpath, {mode: 0o755})
			syscall.Mount(dev, mntpath, m.part.FS, 0, '')
		}
		lock.unlock()
	
		generateFSTab(context)
		generateKernelRoot(context)	
		// Now that all partitions are created (re)trigger all udev events for
		// the image file to make sure everything is in a reasonable state
		triggerDeviceNodes(context)
	}

	const Cleanup = context => {
		for (let idx = Mountpoints.length - 1; 0 <= idx; idx--) {
			const m = Mountpoints[idx]
			const mntpath = path.join(context.ImageMntDir, m.Mountpoint)
			syscall.Unmount(mntpath, 0)
			m.Buildtime && fs.unlinkSync(mntpath) // skip read-only file system
		}
		if (usingLoop) {
			loopDev.Detach()
			loopDev.Remove() // may take a while or multiple attempts, sleep for 60s
		}
	}
	const PostMachineCleanup = context => {
		const image = path.join(context.artifactDir, ImageName)
		// Remove the image in case of any action failure
		context.State != debos.Success && fs.existsSync(image) && fs.unlinkSync(image)
	}
	const Verify = context => {
		if (GptGap) {
			console.log('WARNING: special version of parted is needed for "gpt_gap" option')
			if (PartitionType !== 'gpt') return console.error('gpt_gap property could be used only with "gpt" label')
			// Just check if it contains correct value
			units.FromHumanSize(GptGap)
		}
		if (DiskID) {
			const partitionTypes = {
				gpt: () => uuid.Parse(DiskID),
				msdos: () => DiskID.length === 8 && '0x' + hex.DecodeString(DiskID), // 32-bit hexadecimal number
			}
			partitionTypes[PartitionType]()
		}
		let num = 1
		for (let idx = 0; idx < Partitions.length; idx++) {
			const p = Partitions[idx]
			p.number = num++
			if (!p.Name) return console.error('Partition without a name')
	
			// check for duplicate partition names
			for (let j = idx + 1; j < Partitions.length; j++) {
				if (Partitions[j].Name == p.Name) return console.error(`Partition ${p.Name} already exists`)
			}	
			if (p.FSUUID) {
				["btrfs", "ext2", "ext3", "ext4", "xfs"].includes(p.FS) && uuid.Parse(p.FSUUID) // TODO: FIXME
				['vfat', 'fat32'].includes(p.FS) && p.FSUUID.length === 8 && hex.DecodeString(p.FSUUID) // 32-bit hexadecimal number
			}
	
			if (PartitionType !== 'gpt' && p.PartLabel)
				return console.error('Can only set partition partlabel on GPT filesystem')
	
			p.PartUUID && PartitionType === 'gpt' && uuid.Parse(p.PartUUID)
			
			if (p.PartType) {
				const partTypeLen = PartitionType === 'gpt' ? 36 : PartitionType === 'msdos' ? 2 : 0
				if (p.PartType.length !== partTypeLen)
					return console.error(`incorrect partition type for ${p.Name}, should be ${partTypeLen} characters`)
			}
	
			if (!p.Start) return console.error(`Partition ${p.Name} missing start`)
			if (!p.End) return console.error(`Partition ${p.Name} missing end`)
			p.FS = p.FS === 'fat32' ? 'vfat' : p.FS
			if (!p.FS) return console.error(`Partition ${p.Name} missing fs type`)
			for (let idx = 0; idx < Mountpoints.length; idx++) {
				const m = Mountpoints[idx]
				// check for duplicate mountpoints
				for (let j = idx + 1; j < Mountpoints.length; j++) {
					if (Mountpoints[j].Mountpoint == m.Mountpoint) 
						return fmt.Errorf(`Mountpoint ${m.Mountpoint} already exists`)
				}
				for (const pidx = 0; pidx < Partitions.length; pidx++) {
					const p = Partitions[pidx]
					if (m.Partition == p.Name) {
						m.part = p
						break
					}
					if (!m.part) return console.error("Couldn't find partition for", m.Mountpoint)
				}
			}
		}
	
		// Calculate the size based on the unit (binary or decimal)
		// binary units are multiples of 1024 - KiB, MiB, GiB, TiB, PiB
		// decimal units are multiples of 1000 - KB, MB, GB, TB, PB
		const getSizeValueFunc = /^[0-9]+[kmgtp]ib+$/.test(ImageSize.toLowerCase()) ? units.RAMInBytes : units.FromHumanSize
		imgPart.size = getSizeValueFunc(ImageSize)
	}
	return {
		UnmarshalYAML, generateFSTab, generateKernelRoot, getPartitionDevice,
		triggerDeviceNodes, PreMachine, formatPartition, PreNoMachine,
		Run, Cleanup, PostMachineCleanup, Verify, PostMachine: () => {},
	}
}
