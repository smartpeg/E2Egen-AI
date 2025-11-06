import fs from "fs";
import { readdir, unlink } from "fs/promises";
export class Cleaner {
  //stepspack, toClean, steps
  constructor(options = {}) {
    this.path = "./stepspacks/" + options.stepsPack + "/generated/";
    this.toClean = options.toClean;
    this.steps = options.steps;

    // console.log("isArray TOCLEAN", Array.isArray(this.toClean));
  }

  clean() {
    if (this.toClean.includes("orphans") && fs.existsSync(this.path)) {
      this._removeOrphansCodes();
    }
  }

  async _removeOrphansCodes() {
    console.log(this.stepsPack);
    const ids = [];
    this.steps.forEach((value) => {
      ids.push(value.id);
    });

    const stepsFileNameArr = await this._getStepsCodeIdArr();
    for (const filename of stepsFileNameArr) {
      const idToSearch = filename.split("-")[1].split(".")[0];
      if (!ids.includes(idToSearch)) {
        //console.log(idToSearch + "does not exist its nk");
        await unlink(this.path + "step-" + idToSearch + ".js");
      }
    }
  }

  async _getStepsCodeIdArr() {
    try {
      const files = await readdir(this.path);
      const stepsFileNameArr = files.filter((filename) =>
        filename.includes("step-")
      );
      return stepsFileNameArr;
    } catch (err) {
      console.error(err);
      return [];
    }
  }
}
