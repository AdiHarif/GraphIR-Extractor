function processAge(age: number) {
    return age;
}

let dog = {
    name: "Ben Zion",
    age: 83,
    favoriteFood: "Pizza",
    hoursToSleep: function(tired: boolean) {
        if (!tired) {
            return 0;
        }
        if (this.age > 50) {
            return 7;
        }
        return 9;
    }
};

dog["nickname"] = "Benzi";
processAge(dog.age);
dog.hoursToSleep(true);