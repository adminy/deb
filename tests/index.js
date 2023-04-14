import esmock from 'esmock'
import tap from 'tap'

const main = await esmock('../index.js')
tap.equal(main(), {})
