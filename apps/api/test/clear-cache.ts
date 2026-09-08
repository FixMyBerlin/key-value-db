import { afterEach } from 'vitest'
import { clearProjectCache } from '../src/store/projects'

afterEach(() => {
  clearProjectCache()
})
