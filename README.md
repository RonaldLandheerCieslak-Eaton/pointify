Track the points and velocity of team members.

## Setup
To run this script, create a .env file with:
```
INSTANCE_URI=http://server:8080/path/to/tfs/collection
TEAM_PROJECTS=["MyProject", "MyOtherProject", "YetAnotherProject"]
TEAM_ACCESS_TOKEN=myPersonalAccessToken
DEFAULT_POINTS_BY_TYPE={"Delivery": 1, "Design" : 64, "Documentation" : 1, "Other": 16, "QA Testing": 16, "Release Note": 1}
DEFAULT_POINTS_BY_RELATIVE_SIZE={"0- Unknown" : 16,"1- Tiny" : 4,"2- Small" : 16,"3- Medium" : 64,"4- Large" : 256,"5- Extra-Large" : 1024}
CORE_TEAM=["Dev1","Dev2","Dev3","Dev4"]
TEAM_MEMBERS=["Dev1","Dev2","Dev3","Dev4","Dev5","Dev6"]
```

You need Node 16 to run this. I use NVM ([POSIX version](https://github.com/nvm-sh/nvm) or [Windows version](https://github.com/coreybutler/nvm-windows)) to manage this.

```
nvm use 16
npm install
npm run start
```
This will give you an output that looks like this:
```
Parent not found for 71762!
{
    "totalPoints": 3351,
    "pointsPerUser": {
        "Max Planck (Dev1)": 244,
        "Albert Einstein (Dev2)": 1493,
        "Stephen Hawking (Dev4)": 113,
        "Erwin Schroedinger (Dev3)": 627,
        "Werner Heisenberg (Dev5)": 874
    },
    "teamAverage": 670.2
}
```
