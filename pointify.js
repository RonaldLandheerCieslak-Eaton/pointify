import env from './env.cjs';
import * as azdev from 'azure-devops-node-api';
import Bluebird from 'bluebird';

async function getAzure(env) {
    const authHandler = azdev.getPersonalAccessTokenHandler(env.accessToken);
    const connection = new azdev.WebApi(env.instanceUri, authHandler);
    return await connection.getWorkItemTrackingApi();
}

async function getWorkItems(env, api, query) {
    let teamProjectQuerySnippet = '';
    let first = true;
    query.teamProjects.forEach((teamProject) => {
        if (!first) {
            teamProjectQuerySnippet += ' OR '
        }
        teamProjectQuerySnippet += `[System.TeamProject] = "${teamProject}"`
        first = false;
    });

    let workItemTypeSnippet = '';
    first = true;
    query.workItemTypes.forEach((workItemType) => {
        if (!first) {
            workItemTypeSnippet += ' OR '
        }
        workItemTypeSnippet += `[System.WorkItemType] = '${workItemType}'`
        first = false;
    });
    const wiql = `SELECT [System.Id] From WorkItems Where (${teamProjectQuerySnippet}) AND (${workItemTypeSnippet}) ` + ((query.state) ? `AND [State] = '${query.state}' ` : `AND [State] <> 'Removed' `) + ((query.asof) ? `AND [Microsoft.VSTS.Common.ClosedDate] >= "${query.asof.getUTCFullYear()}-${query.asof.getUTCMonth() + 1}-${query.asof.getUTCDate()}"` : '') + ` order by [System.CreatedDate] desc`;
    return api.queryByWiql({query: wiql})
    .then((workItems) => {
        const idsToFetch = [];
        workItems.workItems.forEach((workItem) => {
            idsToFetch.push(workItem.id);
        })
        if (idsToFetch.length <= 200) {
            return api.getWorkItemsBatch({ ids: idsToFetch, $expand: 'Relations' });
        }
        else {
            const results = [];
            let begin = 0;
            let end = 200;
            while (begin < idsToFetch.length) {
                const ids = idsToFetch.slice(begin, end);
                results.push(api.getWorkItemsBatch({ ids, $expand: 'Relations' }));
                begin = end;
                end += 200;
                if (end > idsToFetch.length) end = idsToFetch.length;
            }
            return Bluebird.all(results)
            .then((workItems) => {
                return workItems.reduce((prev, curr) => {
                    return prev.concat(curr);
                })
            })
        }
    })
}

async function getTasksClosedAsOf(env, api, asof, state) {
    return getWorkItems(env, api, { teamProjects: env.teamProjects, workItemTypes: ['Task'], state, asof })
}

function getWorkItemIdFromUrl(url) {
    const re = /([0-9]+)$/;
    const matches = url.match(re);
    return matches[1];
}
async function getParentWorkItem(api, workItem) {
    let retval = undefined;
    if (workItem.relations) {
        workItem.relations.forEach((relation) => {
            if (relation.rel === 'System.LinkTypes.Hierarchy-Reverse') {
                const id = getWorkItemIdFromUrl(relation.url);
                retval = api.getWorkItem(id);
            }
        })
    }
    return retval ? retval : new Promise((resolve, reject) => {
        console.log(`Parent not found!`);
        resolve();
    });
}

function filterOutByReason(tasks, reasons) {
    const retval = [];
    tasks.forEach((task) => {
        if (!reasons.includes(task.fields['System.Reason'])) {
            retval.push(task);
        }
    });
    return retval;
}

function getWorkItemPoints(api, workItem) {
    if (Object.keys(workItem.fields).includes('Microsoft.VSTS.Scheduling.OriginalEstimate') && workItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] != 0) {
        return new Promise((resolve) => {resolve(workItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate']);});
    }
    if (env.defaultPointsByDiscipline[workItem.fields['Microsoft.VSTS.Common.Discipline']]) {
        return new Promise((resolve) => {resolve(env.defaultPointsByDiscipline[workItem.fields['Microsoft.VSTS.Common.Discipline']]);});
    }

    return getParentWorkItem(api, workItem)
    .then((parentWorkItem) => {
        let retval = env.defaultPointsByRelativeSize[parentWorkItem.fields['Cybectec.CMMI.RelativeSize']] ? env.defaultPointsByRelativeSize[parentWorkItem.fields['Cybectec.CMMI.RelativeSize']] : env.defaultPointsByRelativeSize['0- Unknown'];
        
        return retval;
    })
    .catch(() => {
        return new Promise((resolve) => {resolve(env.defaultPointsByRelativeSize['0- Unknown']);});
    });
}

function getWorkItemOwner(api, workItem) {
    return workItem.fields['System.AssignedTo'];
}

export async function pointify(env) {
    const api = await getAzure(env);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 3);
    let tasks = await getTasksClosedAsOf(env, api, oneMonthAgo, 'Closed');
    tasks = filterOutByReason(tasks, ['Duplicate', 'Rejected']);
    const points = [];
    tasks.forEach((workItem) => {
        const score = getWorkItemPoints(api, workItem);
        const owner = getWorkItemOwner(api, workItem);
        points.push(score.then((score) => { return { owner, score }; }));
    });
    let totalPoints = 0;
    return Bluebird.all(points)
    .then((points) => {
        const pointsPerUser = {};
        const users = {};
        totalPoints = points.reduce((prev, curr) => {
            if (curr) {
                if (Object.keys(pointsPerUser).includes(curr.owner.url)) {
                    pointsPerUser[curr.owner.url] += curr.score;
                }
                else {
                    pointsPerUser[curr.owner.url] = curr.score;
                }
                users[curr.owner.url] = curr.owner;
                return prev + curr.score;
            }
            else {
                return prev;
            }
        }, 0);
        const prettyPointsPerUser = {};
        let coreTeamTotalPoints = 0;
        Object.keys(pointsPerUser).forEach((userUrl) => {
            const eNumber = users[userUrl].uniqueName.match(/[^\\]+$/)[0];
            if (env.teamMembers.includes(eNumber)) {
                prettyPointsPerUser[`${users[userUrl].displayName} (${eNumber})`] = pointsPerUser[userUrl];
            }
            if (env.coreTeam.includes(eNumber)) {
                coreTeamTotalPoints += pointsPerUser[userUrl];
            }
        })
        return {totalPoints,pointsPerUser: prettyPointsPerUser, teamAverage: coreTeamTotalPoints / env.coreTeam.length}
    });
}

async function main(env) {
    console.log(JSON.stringify(pointify(env), null, 4));
}

main(env)
