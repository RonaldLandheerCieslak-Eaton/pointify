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
    if (Object.keys(workItem.fields).includes('Microsoft.VSTS.Scheduling.OriginalEstimate') && workItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] != 0) return workItem.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'];
    if (env.defaultPointsByDiscipline[workItem.fields['Microsoft.VSTS.Common.Discipline']]) return env.defaultPointsByDiscipline[workItem.fields['Microsoft.VSTS.Common.Discipline']];

    return getParentWorkItem(api, workItem)
    .then((parentWorkItem) => {
        let retval = env.defaultPointsByRelativeSize[parentWorkItem.fields['Cybectec.CMMI.RelativeSize']] ? env.defaultPointsByRelativeSize[parentWorkItem.fields['Cybectec.CMMI.RelativeSize']] : env.defaultPointsByRelativeSize['0- Unknown'];
        
        return retval;
    })
    .catch(() => {
        return env.defaultPointsByRelativeSize['0- Unknown'];
    });
}

async function main(env) {
    const api = await getAzure(env);
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    let tasks = await getTasksClosedAsOf(env, api, oneMonthAgo, 'Closed');
    tasks = filterOutByReason(tasks, ['Duplicate', 'Rejected']);
    const points = [];
    tasks.forEach((workItem) => {
        points.push(getWorkItemPoints(api, workItem));
    });
    let totalPoints = 0;
    Bluebird.all(points)
    .then((points) => {
        totalPoints = points.reduce((prev, curr) => {
            if (curr) {
                return prev + curr;
            }
            else {
                return prev;
            }
        }, 0);
        console.log(totalPoints);
    });
}

main(env)
