import env from './env.cjs';
import * as azdev from 'azure-devops-node-api';

async function main(env) {
    const authHandler = azdev.getPersonalAccessTokenHandler(env.accessToken);
    const connection = new azdev.WebApi(env.instanceUri, authHandler);
    const api = await connection.getWorkItemTrackingApi();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const request = {
        asOf: oneMonthAgo,
        fields: ['System.Id', 'System.WorkItemType']
    };
    //const query = `SELECT [System.Id] From WorkItems Where [System.TeamProject] = "${env.teamProject}" AND [System.WorkItemType] = 'Task' AND [State] = 'Closed' AND [State] <> 'Removed' AND [Microsoft.VSTS.Common.ClosedDate] >= "${oneMonthAgo.getUTCFullYear()}-${oneMonthAgo.getUTCMonth() + 1}-${oneMonthAgo.getUTCDate()}" order by [System.CreatedDate] desc`;
    const query = `SELECT [System.Id] From WorkItems Where [System.TeamProject] = "${env.teamProject}" AND [System.WorkItemType] = 'Task' AND [State] <> 'Removed'`;
    return api.queryByWiql({query})
    .then((workItems) => {
        const idsToFetch = [];
        workItems.workItems.forEach((workItem) => {
            idsToFetch.push(workItem.id);
        })
        if (idsToFetch.length <= 200) {
            return api.getWorkItemsBatch({ ids: idsToFetch, fields: ["System.Id", "System.Title", "Microsoft.VSTS.Scheduling.OriginalEstimate"] });
        }
        else {
            
        }
    })
    .then((workItems) => {
        console.log(workItems);
    })
}

main(env)
