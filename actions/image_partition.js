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
		fd = os.open(context.image)
		syscall.flock(fd, syscall.lOCK_EX)
		return {unlock: () => fd.close()}
	}
	const mkPart = ({ number, name, partLabel, partType, partUUID, start, end, FS, flags, features, extendedOptions, fsck /** fsck */, FSUUID }) => {}
	const mkMountPoint = ({ mountpoint, partition, options, buildtime, part /** mkPart */ }) => {}

	const unmarshalYAML = unmarshal => {
		const part = mkPart({Fsck: true})
		unmarshal(part)
		return Partition(part)
	}

	const generateFSTab = context => {
		context.imageFSTab.reset()
		for (const m of Mountpoints) {
			const options = ['defaults', ...m.options]
			if (m.buildtime) continue // Do not need to add mount point into fstab
			if (!m.part.FSUUID) return console.error('Missing fs UUID for partition', m.part.name)
			let fs_passno = 0
			if (m.part.fsck) {
				fs_passno = m.mountpoint === '/' ? 1 : 2
			}
			context.imageFSTab.writeString(`UUID=${m.part.FSUUID}\t${m.mountpoint}\t${m.part.fS}\t${options.join(',')}\t0\t${fs_passno}\n`)
		}
    }

	const generateKernelRoot = context => {
		for (const m of Mountpoints.filter(m => m.mountpoint === '/')) {
			if (!m.part.FSUUID) return console.error('No fs UUID for root partition !?!')
			context.imageKernelRoot = 'root=UUID=' + m.part.FSUUID
			break
		}
	}

	const getPartitionDevice = (number, context) => {
		// Always look up canonical device as udev might not generate the by-id
		// symlinks while there is an flock on /dev/vda
		const device = fs.realpathSync(context.image)
		const suffix = 'p'
		// Check partition naming first: if used 'by-id'i naming convention
		if (device.includes('/disk/by-id/')) { suffix = '-part' }
	
		// If the iamge device has a digit as the last character, the partition
		// suffix is p<number> else it's just <number>
		const last = parseInt(device[device.length - 1], 10)
		return last >= 0 && last <= 9 ? device + suffix + number : device + number
	}

	const triggerDeviceNodes = context => debos.command.run(
		'udevadm', 'udevadm', 'trigger', '--settle', context.image
	)

	const preMachine = (context, m, args) => {
		const imagePath = path.join(context.artifactDir, ImageName)
		const image = m.createImage(imagePath, size)
		context.image = image
		args.push('--internal-image', image)
	}

	const formatPartition = (p, context) => {
		const label = 'Formatting partition ' + p.number
		const path = getPartitionDevice(p.number, context)
		const cmdline = []
		const typeOfPartition = {
			vfat: () => {
				cmdline.push('mkfs.vfat', '-F32', '-n', p.name)
				p.FSUUID && cmdline.push('-i', p.FSUUID)
			},
			btrfs: () => {
				// Force formatting to prevent failure in case if partition was formatted already
				cmdline.push('mkfs.btrfs', '-L', p.name, '-f')
				p.features.length && cmdline.push('-O', p.features.join(','))
				p.FSUUID && cmdline.push('-U', p.FSUUID)
			},
			f2fs: () => {
				cmdline.push('mkfs.f2fs', '-l', p.name)
				p.features.length && cmdline.push('-O', p.features.join(','))
			},
			hfs: () => cmdline.push('mkfs.hfs', '-h', '-v', p.name),
			hfsplus: () => cmdline.push('mkfs.hfsplus', '-v', p.name),
			hfsx: () => {
				cmdline.push('mkfs.hfsplus', '-s', '-v', p.name),
				// hfsx is case-insensitive hfs+, should be treated as "normal" hfs+ from now on
				p.fS = 'hfsplus'
			},
			xfs: () => {
				cmdline.push('mkfs.xfs', '-L', p.name)
				p.FSUUID && cmdline.push('-m', 'uuid=' + p.FSUUID)
			},
			none: () => {
				cmdline.push('mkfs.' + p.fS, '-L', p.name)
				p.features.length && cmdline.push('-O', p.features.join(','))
				p.extendedOptions.length && cmdline.push('-E', p.extendedOptions.join(','))
				p.FSUUID && ['ext2', 'ext3', 'ext4'].includes(p.fS) && cmdline.push('-U', p.FSUUID)
			}
		}
		typeOfPartition[p.fS]?.() || typeOfPartition.none()
		if (cmdline.length) {
			cmdline.push(path)
		}
		const cmd = debos.command
		/* Some underlying device driver, e.g. the UML UBD driver, may manage holes
		 * incorrectly which will prevent to retrieve all useful zero ranges in
		 * filesystem, e.g. when using 'bmaptool create', see patch
		 * http://lists.infradead.org/pipermail/linux-um/2022-January/002074.html
		 *
		 * Adding UNIX_IO_NOZEROOUT environment variable prevent mkfs.ext[234]
		 * utilities to create zero range spaces using fallocate with
		 * FALLOC_FL_ZERO_RANGE or FALLOC_FL_PUNCH_HOLE */
		['ext2', 'ext3', 'ext4'].includes(p.fS) && cmd.addEnv('UNIX_IO_NOZEROOUT=1')
		cmd.run(label, ...cmdline)
		if (p.fS !== 'none' && !p.FSUUID) {
			p.FSUUID = exec.command('blkid', '-o', 'value', '-s', 'UUID', '-p', '-c', 'none', path).output().trim()
		}
	}

	const preNoMachine = context => {
		const imagePath = path.join(context.artifactDir, ImageName)
		const img = os.openFile(imagePath, os.o_WRONLY|os.o_CREATE, 0o666)
		img.truncate(i.size) // resize
		img.close()
		imgPart.loopDev = losetup.attach(imagePath, 0, false)
		context.image = loopDev.path()
		imgPart.usingLoop = true
	}

	const run = context => {
		// LogStart()
	
		/* On certain disk device events udev will call the BLKRRPART ioctl to
		 * re-read the partition table. This will cause the partition devices
		 * (e.g. vda3) to temporarily disappear while the rescanning happens.
		 * udev does this while holding an exclusive flock. This means to avoid partition
		 * devices disappearing while doing operations on them (e.g. formatting
		 * and mounting) we need to do it while holding an exclusive lock
		 */
		const command = ['parted', '-s', context.image, 'mklabel', PartitionType]
		GptGap && command.push(GptGap)
		debos.command.run('parted', ...command)
		DiskID && debos.command.run('sfdisk', ...['sfdisk', '--disk-id', context.image, DiskID])
	
		for (let idx = 0; idx < Partitions.length; idx++) {
			const p = Partitions[idx]
	
			if (!p.partLabel) {
				p.partLabel = p.name
			}

			const name = PartitionType === 'gpt' ? p.partLabel : 'primary'
	
			const fsType = p.fS === 'vfat' ? 'fat32' : p.fS === 'hfsplus' ? 'hfs+' : p.fS
			debos.command.run('parted', 'parted', '-a', 'none', '-s', '--', context.image, 'mkpart', name, fsType, p.start, p.end)
			p.flags.map(flag => debos.command.run('parted', 'parted', '-s', context.image, 'set', p.number, flag, 'on'))
			p.partType && debos.command.run('sfdisk', 'sfdisk', '--part-type', context.image, p.number, p.partType)			
			// PartUUID will only be set for gpt partitions
			p.partUUID && debos.command.run('sfdisk', 'sfdisk', '--part-uuid', context.image, p.number, p.partUUID)
			const lock = lockImage(context)
			formatPartition(p, context)
			lock.unlock()	
			const devicePath = getPartitionDevice(p.number, context)
			context.imagePartitions.push(debos.partition(p.name, devicePath))
		}		
		context.imageMntDir = path.join(context.scratchdir, 'mnt')
		fs.mkdirSync(context.imageMntDir, {mode: 0o755})
	
		// sort mountpoints based on position in filesystem hierarchy
		Mountpoints.sort((a, b) => {
			const mntA = a.mountpoint
			const mntB = b.mountpoint
			// root should always be mounted first
			if (mntA === '/') return true
			if (mntB === '/') return false
			return mntA.split('/').length < mntB.split('/').length
		})
		const lock = lockImage(context)
		for (const m of Mountpoints) {
			const dev = getPartitionDevice(m.part.number, context)
			const mntpath = path.join(context.imageMntDir, m.mountpoint)
			fs.mkdirSync(mntpath, {mode: 0o755})
			syscall.mount(dev, mntpath, m.part.fS, 0, '')
		}
		lock.unlock()
	
		generateFSTab(context)
		generateKernelRoot(context)	
		// Now that all partitions are created (re)trigger all udev events for
		// the image file to make sure everything is in a reasonable state
		triggerDeviceNodes(context)
	}

	const cleanup = context => {
		for (let idx = Mountpoints.length - 1; 0 <= idx; idx--) {
			const m = Mountpoints[idx]
			const mntpath = path.join(context.imageMntDir, m.mountpoint)
			syscall.unmount(mntpath, 0)
			m.buildtime && fs.unlinkSync(mntpath) // skip read-only file system
		}
		if (usingLoop) {
			loopDev.detach()
			loopDev.remove() // may take a while or multiple attempts, sleep for 60s
		}
	}
	const postMachineCleanup = context => {
		const image = path.join(context.artifactDir, ImageName)
		// Remove the image in case of any action failure
		context.state != debos.success && fs.existsSync(image) && fs.unlinkSync(image)
	}
	const verify = context => {
		if (GptGap) {
			console.log('WARNING: special version of parted is needed for "gpt_gap" option')
			if (PartitionType !== 'gpt') return console.error('gpt_gap property could be used only with "gpt" label')
			// Just check if it contains correct value
			units.fromHumanSize(GptGap)
		}
		if (DiskID) {
			const partitionTypes = {
				gpt: () => uuid.parse(DiskID),
				msdos: () => DiskID.length === 8 && '0x' + hex.decodeString(DiskID), // 32-bit hexadecimal number
			}
			partitionTypes[PartitionType]()
		}
		let num = 1
		for (let idx = 0; idx < Partitions.length; idx++) {
			const p = Partitions[idx]
			p.number = num++
			if (!p.name) return console.error('Partition without a name')
	
			// check for duplicate partition names
			for (let j = idx + 1; j < Partitions.length; j++) {
				if (Partitions[j].name == p.name) return console.error(`Partition ${p.name} already exists`)
			}	
			if (p.FSUUID) {
				["btrfs", "ext2", "ext3", "ext4", "xfs"].includes(p.fS) && uuid.parse(p.FSUUID) // TODO: FIXME
				['vfat', 'fat32'].includes(p.fS) && p.FSUUID.length === 8 && hex.decodeString(p.FSUUID) // 32-bit hexadecimal number
			}
	
			if (PartitionType !== 'gpt' && p.partLabel)
				return console.error('Can only set partition partlabel on GPT filesystem')
	
			p.partUUID && PartitionType === 'gpt' && uuid.parse(p.partUUID)
			
			if (p.partType) {
				const partTypeLen = PartitionType === 'gpt' ? 36 : PartitionType === 'msdos' ? 2 : 0
				if (p.partType.length !== partTypeLen)
					return console.error(`incorrect partition type for ${p.name}, should be ${partTypeLen} characters`)
			}
	
			if (!p.start) return console.error(`Partition ${p.name} missing start`)
			if (!p.end) return console.error(`Partition ${p.name} missing end`)
			p.fS = p.fS === 'fat32' ? 'vfat' : p.fS
			if (!p.fS) return console.error(`Partition ${p.name} missing fs type`)
			for (let idx = 0; idx < Mountpoints.length; idx++) {
				const m = Mountpoints[idx]
				// check for duplicate mountpoints
				for (let j = idx + 1; j < Mountpoints.length; j++) {
					if (Mountpoints[j].mountpoint == m.mountpoint) 
						return fmt.errorf(`Mountpoint ${m.mountpoint} already exists`)
				}
				for (const pidx = 0; pidx < Partitions.length; pidx++) {
					const p = Partitions[pidx]
					if (m.partition == p.name) {
						m.part = p
						break
					}
					if (!m.part) return console.error("Couldn't find partition for", m.mountpoint)
				}
			}
		}
	
		// Calculate the size based on the unit (binary or decimal)
		// binary units are multiples of 1024 - KiB, MiB, GiB, TiB, PiB
		// decimal units are multiples of 1000 - KB, MB, GB, TB, PB
		const getSizeValueFunc = /^[0-9]+[kmgtp]ib+$/.test(ImageSize.toLowerCase()) ? units.rAMInBytes : units.fromHumanSize
		imgPart.size = getSizeValueFunc(ImageSize)
	}
	return {
		unmarshalYAML, generateFSTab, generateKernelRoot, getPartitionDevice,
		triggerDeviceNodes, preMachine, formatPartition, preNoMachine,
		run, cleanup, postMachineCleanup, verify, postMachine: () => {},
	}
}
