#!/usr/bin/env node
/**
 * Copy shared skills from plugins/agent-looper/skills/ into this package's skills/.
 * Run before dsh plugin add, npm pack, or publish. Native run-loop-in-dsh is untouched.
 */
import { materializeSharedSkills, SHARED_SKILLS } from './skills-layout.mjs'

materializeSharedSkills()
console.log(`materialize-skills: copied ${SHARED_SKILLS.join(', ')}`)
