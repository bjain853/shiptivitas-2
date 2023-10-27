import express from 'express';
import Database from 'better-sqlite3';

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({'message': 'SHIPTIVITY API. Read documentation to see API docs'});
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (priority && !Number.isNaN(priority) && priority > 0) {
    return {
      valid: true,
    }
  
  }else{
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid priority provided.',
      'long_message': 'Priority can only be positive integer.',
      },
    };
  }
}

const validateStatus = (status) =>{
  if(status && ['complete','in-progress','backlog'].indexOf(status) > -1){
    return {
      valid:true,
    }
  }

  return  {
    valid: false,
    messageObj: {
    'message': 'Invalid status provided.',
    'long_message': 'Priority can only be complete, in-progress or backlog.',
     }, 
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }

  let { status, priority } = req.body;
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);

  /* ---------- Update code below ----------*/


  try{
    const priorityValid = validatePriority(priority).valid;
    const statusValid = validateStatus(status).valid;

    if (client){

      const maxPriorityAllowed = findMaxPriorityByStatus(clients,statusValid ? status : client.status);

      if(statusValid){
        updateStatus(client,status,maxPriorityAllowed);
      }

      if(priorityValid){
        updatePriority(client,priority <= maxPriorityAllowed ? priority:maxPriorityAllowed);
      }

    const updatedClients = db.prepare('select * from clients').all();
    
    return res.status(200).send(updatedClients);
    }

    }catch(e){
      console.log(e)
      return res.status(500).send("Server Error: Could not process the given request");
  }
});

const updatePriority=(client,newPriority)=>{
  if(newPriority === client.priority){
    return ;
  }

  if(newPriority < client.priority){
    db.prepare('UPDATE clients SET priority = priority + 1 WHERE status= ? AND priority >= ? AND priority < ?').run(client.status,newPriority,client.priority);

  }else if(newPriority > client.priority){
    db.prepare('UPDATE clients SET priority = priority + 1 WHERE status= ? AND priority <= ? AND priority > ?').run(client.status,newPriority,client.priority);
  }

  db.prepare('UPDATE clients SET priority = ? WHERE id = ?').run(newPriority,client.id);

}

const updateStatus = (client,newStatus,maxPriorityNewStatus)=>{

  if (newStatus === client.status){
    return;
  }
  db.prepare('UPDATE clients SET priority = priority - 1 where priority > ? and status = ?').run(client.priority,client.status); //remove from old status
  db.prepare('UPDATE clients SET priority = ?, status = ? where id = ?').run(maxPriorityNewStatus,newStatus,client.id); // add to bottom of the new status
}

const findMaxPriorityByStatus = (clients,status)=>{

  if (clients.length > 0) return clients.filter(client=>client.status === status).length+1;
  return 1;
}

app.listen(3001);
console.log('app running on port ', 3001);
