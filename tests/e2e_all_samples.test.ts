
import { execSync } from "child_process"
import * as fs from 'fs'


describe("End to end tests on all samples", () => {
    const dir = "samples"
    const files = fs.readdirSync(dir)
    for (const file of files) {
        test(file, () => {
            execSync(`npm run start -- -i samples/${file}`, { stdio: 'ignore' })
        })
    }

})
